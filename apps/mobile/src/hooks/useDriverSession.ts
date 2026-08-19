import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import NetInfo from "@react-native-community/netinfo";
import { captureLocation, SYNC_STATUS } from "../offlineStore.js";
import { syncPendingEvents } from "../syncWorker.js";
import { createSqliteStore } from "../lib/localStore.js";
import { createExpoSqliteDriver } from "../lib/sqliteDriver.js";
import { distanceKm } from "../lib/geo.js";
import { useGpsWatch, type MovementState } from "./useGpsWatch.js";

const VEHICLE_ID = "v-demo-conductor-01";
const ROUTE_NAME = "Ruta Norte 12";
// Respaldo del trigger por conectividad — ver el useEffect del intervalo de
// sync más abajo para la explicación completa de por qué hace falta.
const SYNC_FALLBACK_INTERVAL_MS = 3 * 60_000;

export interface ShiftSummary {
  durationMs: number;
  distanceKm: number;
  syncedEvents: number;
  pendingEvents: number;
}

/**
 * Hook de sesión del conductor: une captura local-first (`offlineStore`),
 * sync por conectividad (`syncWorker`) y el estado de turno (DM-04) en un
 * solo lugar que vive en el componente raíz (`App.tsx`) y se pasa a las
 * pantallas por props — no hay navegación ni contexto global, ver README.md
 * ("por qué no react-navigation").
 *
 * El `LocalStore` real vive en `src/lib/sqliteDriver.ts` (expo-sqlite) +
 * `src/lib/localStore.ts` (capa reactiva síncrona para la UI sobre ese
 * driver async) — este hook solo conoce el contrato `LocalStore`.
 */
export function useDriverSession() {
  const store = useRef(createSqliteStore(createExpoSqliteDriver())).current;
  const events = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const pendingCount = events.filter((e) => e.status !== SYNC_STATUS.SYNCED).length;

  const [isOnline, setIsOnline] = useState(true);
  const [shiftActive, setShiftActive] = useState(false);
  const [shiftStartedAt, setShiftStartedAt] = useState<number | null>(null);
  const [movement, setMovement] = useState<MovementState>("stopped");
  const [distance, setDistance] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [lastShift, setLastShift] = useState<ShiftSummary | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const shiftEventIdsRef = useRef<Set<string>>(new Set());
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(null);

  // Reloj para el banner ("turno" en vivo) — refresco de UI local, no polling
  // de red ni de estado de sync (eso sigue disparado solo por conectividad).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // findPending() (autoritativo contra la DB) en vez de getSnapshot() (cache
  // síncrona) — con hidratación async, si ya había conectividad al abrir la
  // app el trigger puede dispararse antes de que la cache se hidrate, y
  // getSnapshot() leería [] salteándose el sync de eventos pendientes de una
  // sesión anterior.
  const attemptSync = useCallback(() => {
    store.findPending().then((pendingBefore) => {
      if (pendingBefore.length === 0) return;
      syncPendingEvents(store).then(() => {
        store.findPending().then((pendingAfter) => {
          if (pendingAfter.length < pendingBefore.length) setLastSyncAt(Date.now());
        });
      });
    });
  }, [store]);

  // Trigger primario: listener de conectividad de NetInfo — ver skill
  // `mobile-offline-sync`. NetInfo entrega el estado actual inmediatamente
  // al suscribirse, así que también cubre "ya había red al abrir la app"
  // sin código extra.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected);
      setIsOnline(online);
      if (online) attemptSync();
    });
    return unsubscribe;
  }, [attemptSync]);

  // Respaldo del trigger de arriba: si la conectividad se mantiene estable
  // (WiFi sin cortes, sin cambiar de red) NetInfo nunca dispara un evento de
  // "cambio" y el sync nunca se reintenta — confirmado en dispositivo real,
  // la cola de pendientes crecía sin bajar nunca con WiFi estable. Reintenta
  // cada SYNC_FALLBACK_INTERVAL_MS mientras haya conexión, sin reemplazar
  // el trigger reactivo (que sigue siendo el camino rápido/primario ante un
  // cambio real de conectividad).
  useEffect(() => {
    if (!isOnline) return;
    const id = setInterval(attemptSync, SYNC_FALLBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isOnline, attemptSync]);

  useGpsWatch(shiftActive, (fix) => {
    setMovement(fix.movement);
    if (lastFixRef.current) {
      setDistance((d) => d + distanceKm(lastFixRef.current!, { lat: fix.latitude, lng: fix.longitude }));
    }
    lastFixRef.current = { lat: fix.latitude, lng: fix.longitude };

    captureLocation(store, { latitude: fix.latitude, longitude: fix.longitude }, VEHICLE_ID)
      .then(() => {
        // El eventId real solo se conoce tras insertar; se registra a partir
        // del snapshot del store (última fila) en vez de duplicar el uuid.
        const inserted = store.getSnapshot().at(-1);
        if (inserted) shiftEventIdsRef.current.add(inserted.eventId);
      })
      .catch(() => {
        // captureLocation ya loguea y relanza — un fallo de escritura local
        // no debe tumbar la sesión de conducción.
      });
  });

  const startShift = useCallback(() => {
    shiftEventIdsRef.current = new Set();
    lastFixRef.current = null;
    setDistance(0);
    setMovement("stopped");
    setShiftStartedAt(Date.now());
    setShiftActive(true);
  }, []);

  const currentShiftSummary = useCallback((): ShiftSummary => {
    const shiftEvents = events.filter((e) => shiftEventIdsRef.current.has(e.eventId));
    return {
      durationMs: shiftStartedAt ? now - shiftStartedAt : 0,
      distanceKm: distance,
      syncedEvents: shiftEvents.filter((e) => e.status === SYNC_STATUS.SYNCED).length,
      pendingEvents: shiftEvents.filter((e) => e.status !== SYNC_STATUS.SYNCED).length,
    };
  }, [events, shiftStartedAt, now, distance]);

  const endShift = useCallback(() => {
    setLastShift(currentShiftSummary());
    setShiftActive(false);
    setShiftStartedAt(null);
  }, [currentShiftSummary]);

  const shiftEvents = events.filter((e) => shiftEventIdsRef.current.has(e.eventId));

  return {
    vehicleId: VEHICLE_ID,
    route: ROUTE_NAME,
    isOnline,
    shiftActive,
    shiftStartedAt,
    movement,
    distanceKm: distance,
    nowMs: now,
    pendingCount,
    lastShift,
    lastSyncAt,
    shiftEvents,
    currentShiftSummary,
    startShift,
    endShift,
  };
}

export type DriverSession = ReturnType<typeof useDriverSession>;
