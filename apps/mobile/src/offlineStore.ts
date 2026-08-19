import { v4 as uuid } from "uuid";

/**
 * Ver skill `mobile-offline-sync`. El eventId se genera EN EL DISPOSITIVO,
 * nunca en el servidor — es la clave de idempotencia que permite reintentar
 * un lote completo sin crear duplicados en el backend.
 *
 * Este módulo asume una tabla WatermelonDB (o expo-sqlite) llamada
 * "telemetry_events" con las mismas columnas que LocalTelemetryEvent.
 * La integración real con el driver de storage elegido queda para cuando
 * se inicialice el proyecto Expo (ver README.md de esta carpeta).
 *
 * SYNC_STATUS está centralizado como constante "as const" (equivalente
 * idiomático a un enum en TS) para que el driver de storage real (quien
 * implemente LocalStore) y cualquier query que filtre por estado usen el
 * mismo valor, en vez de strings "pending"/"synced" sueltos y propensos a typo.
 */
export const SYNC_STATUS = {
  PENDING: "pending",
  SYNCING: "syncing",
  SYNCED: "synced",
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];

export interface LocalTelemetryEvent {
  eventId: string;
  vehicleId: string;
  lat: number;
  lng: number;
  capturedAt: string;
  status: SyncStatus;
}

// Interfaz mínima que el driver de storage real (WatermelonDB/expo-sqlite) debe implementar.
export interface LocalStore {
  insert(event: LocalTelemetryEvent): Promise<void>;
  findPending(): Promise<LocalTelemetryEvent[]>;
  markSynced(eventIds: string[]): Promise<void>;
}

/**
 * Captura SIEMPRE local-first. Nunca debe esperar ni depender de red.
 * Si la escritura local falla (ej. disco lleno, error del driver de
 * storage), se loguea y se relanza — el llamador (típicamente un callback
 * de GPS) necesita saber que la captura falló, porque perderla en silencio
 * rompe la garantía central de "offline-first: nunca se pierde un evento".
 */
export async function captureLocation(
  store: LocalStore,
  coords: { latitude: number; longitude: number },
  vehicleId: string,
): Promise<void> {
  try {
    await store.insert({
      eventId: uuid(),
      vehicleId,
      lat: coords.latitude,
      lng: coords.longitude,
      capturedAt: new Date().toISOString(),
      status: SYNC_STATUS.PENDING,
    });
  } catch (err) {
    console.error("Fallo al guardar la ubicación localmente:", err);
    throw err;
  }
}
