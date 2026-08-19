import * as SQLite from "expo-sqlite";
import { SYNC_STATUS, type LocalTelemetryEvent, type SyncStatus } from "../offlineStore.js";

/**
 * Único archivo que importa `expo-sqlite` — el import de un módulo nativo se
 * evalúa al cargar el archivo, así que debe quedar fuera del grafo de
 * imports de los tests (Vitest corre en Node, no en el runtime de Expo).
 * `lib/localStore.ts` depende solo de esta interfaz, nunca de expo-sqlite
 * directamente, para poder inyectar un driver falso en los tests.
 */
export interface SqliteDriver {
  init(): Promise<void>;
  insert(event: LocalTelemetryEvent): Promise<void>;
  findAll(): Promise<LocalTelemetryEvent[]>;
  findPending(): Promise<LocalTelemetryEvent[]>;
  markSynced(eventIds: string[]): Promise<void>;
}

interface TelemetryEventRow {
  eventId: string;
  vehicleId: string;
  lat: number;
  lng: number;
  capturedAt: string;
  status: string;
}

function toEvent(row: TelemetryEventRow): LocalTelemetryEvent {
  return { ...row, status: row.status as SyncStatus };
}

export function createExpoSqliteDriver(dbName = "fleet-telemetry.db"): SqliteDriver {
  // Serializa TODAS las operaciones y abre/cierra una conexión nueva en cada
  // una, en vez de mantener una sola conexión abierta para toda la vida de
  // la app. Dos problemas reales confirmados en dispositivo con una
  // conexión persistente: (1) llamadas concurrentes se pisan en el binding
  // nativo Android de expo-sqlite (bug conocido, ver PR expo/expo#36674
  // "fix reentrant issue for statement.executeAsync") y (2) tras varias
  // operaciones exitosas empiezan a fallar con NullPointerException — algún
  // recurso nativo (statement/cursor) no se libera bien y se agota. Abrir y
  // cerrar por operación es más lento (unos ms por archivo local, volumen
  // de escritura bajo acá) pero elimina cualquier acumulación de estado.
  let queue: Promise<unknown> = Promise.resolve();
  function run<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      const db = await SQLite.openDatabaseAsync(dbName);
      try {
        return await fn(db);
      } finally {
        await db.closeAsync();
      }
    });
    queue = result.catch(() => {});
    return result;
  }

  return {
    init() {
      return run(async (db) => {
        // Dos llamadas separadas, no una sola con ambas sentencias —
        // execAsync con múltiples sentencias en un solo string dispara un
        // NullPointerException nativo en el binding Android de expo-sqlite
        // (basado en libsql) en SDK 57, confirmado en dispositivo real.
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS telemetry_events (
            eventId    TEXT PRIMARY KEY NOT NULL,
            vehicleId  TEXT NOT NULL,
            lat        REAL NOT NULL,
            lng        REAL NOT NULL,
            capturedAt TEXT NOT NULL,
            status     TEXT NOT NULL
          );
        `);
        await db.execAsync(
          "CREATE INDEX IF NOT EXISTS idx_telemetry_events_status ON telemetry_events(status);",
        );
      });
    },

    insert(event) {
      return run(async (db) => {
        await db.runAsync(
          "INSERT INTO telemetry_events (eventId, vehicleId, lat, lng, capturedAt, status) VALUES (?, ?, ?, ?, ?, ?)",
          [event.eventId, event.vehicleId, event.lat, event.lng, event.capturedAt, event.status],
        );
      });
    },

    findAll() {
      return run(async (db) => {
        const rows = await db.getAllAsync<TelemetryEventRow>("SELECT * FROM telemetry_events");
        return rows.map(toEvent);
      });
    },

    findPending() {
      return run(async (db) => {
        const rows = await db.getAllAsync<TelemetryEventRow>(
          "SELECT * FROM telemetry_events WHERE status = ?",
          [SYNC_STATUS.PENDING],
        );
        return rows.map(toEvent);
      });
    },

    markSynced(eventIds) {
      return run(async (db) => {
        if (eventIds.length === 0) return;
        const placeholders = eventIds.map(() => "?").join(", ");
        await db.runAsync(
          `UPDATE telemetry_events SET status = ? WHERE eventId IN (${placeholders})`,
          [SYNC_STATUS.SYNCED, ...eventIds],
        );
      });
    },
  };
}
