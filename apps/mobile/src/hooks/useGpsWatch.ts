import { useEffect, useRef } from "react";
import * as Location from "expo-location";

export type MovementState = "moving" | "stopped";

export interface GpsFix {
  latitude: number;
  longitude: number;
  movement: MovementState;
  timestamp: number;
}

/**
 * Suscribe a `expo-location` mientras `active` es true y reporta cada fix
 * por `onFix`. NUNCA espera a `onFix`/red: `watchPositionAsync` entrega
 * coordenadas de forma continua vía callback, y quien llama (el hook de
 * sesión) las escribe local-first con `captureLocation` — ver
 * `mobile-offline-sync`.
 *
 * GAP DOCUMENTADO: este hook no se ha podido probar contra GPS real de
 * dispositivo/emulador en este entorno de generación (sin Xcode/Android SDK
 * ni hardware con servicios de ubicación disponibles). La llamada a la API
 * de `expo-location` sigue su documentación oficial, pero no hay una
 * verificación end-to-end de permisos/hardware real — ver README.md.
 *
 * Umbral de movimiento: se usa `coords.speed` (m/s) que reporta el propio
 * GPS; > 0.8 m/s (~3 km/h) se considera "moving". Si el dispositivo no
 * reporta `speed` (algunos Android/simulador), se asume "stopped" en vez de
 * adivinar, para no pulsar un anillo "moving" sin evidencia real de movimiento.
 */
export function useGpsWatch(active: boolean, onFix: (fix: GpsFix) => void) {
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    if (!active) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 15 },
          (location) => {
            const speed = location.coords.speed ?? 0;
            onFixRef.current({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              movement: speed > 0.8 ? "moving" : "stopped",
              timestamp: location.timestamp,
            });
          },
        );
      } catch (err) {
        // No bloquea el turno: sin permiso/GPS la captura simplemente no
        // produce fixes, pero el turno sigue activo y la app no crashea.
        console.warn("No se pudo iniciar la captura de GPS:", err);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active]);
}
