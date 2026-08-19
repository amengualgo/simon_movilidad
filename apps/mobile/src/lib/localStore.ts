import { SYNC_STATUS, type LocalStore, type LocalTelemetryEvent } from "../offlineStore.js";
import type { SqliteDriver } from "./sqliteDriver.js";

/**
 * Capa reactiva sobre `LocalStore`, respaldada por un `SqliteDriver` real
 * (ver `sqliteDriver.ts`, la única pieza que toca expo-sqlite). Implementa
 * exactamente el mismo contrato que `offlineStore.ts`/`syncWorker.ts` ya
 * esperan (insert / findPending / markSynced), así que la lógica de captura
 * y de sync no se toca al cambiar de driver.
 *
 * Añade una capa mínima de pub/sub (`subscribe`) para que la UI pueda
 * reaccionar a cambios (contador de pendientes, toast de sync) sin hacer
 * polling — se apoya en `useSyncExternalStore` de React en los hooks que la
 * consumen. Esta suscripción es un detalle de conveniencia para la UI, no
 * forma parte del contrato `LocalStore` que exige la skill `mobile-offline-sync`.
 */
export interface ReactiveLocalStore extends LocalStore {
  /** Snapshot síncrono de todos los eventos — solo para lectura desde la UI. */
  getSnapshot(): LocalTelemetryEvent[];
  subscribe(listener: () => void): () => void;
}

/**
 * El driver de expo-sqlite es async (abrir la DB, correr SQL), pero
 * `getSnapshot`/`subscribe` deben seguir siendo síncronos para cumplir el
 * contrato de `useSyncExternalStore`. Se mantiene una cache en memoria,
 * hidratada una vez desde la DB al construirse (`ready`), que cada método
 * espera antes de leer/escribir. `findPending` consulta el driver
 * directamente (autoritativo) en vez de derivar de la cache, para ser
 * correcto incluso si se llama antes de que termine la hidratación.
 */
export function createSqliteStore(driver: SqliteDriver): ReactiveLocalStore {
  let cache: LocalTelemetryEvent[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const ready = (async () => {
    await driver.init();
    cache = await driver.findAll();
    // Solo notifica si hidrató filas preexistentes (ej. eventos pendientes
    // de una sesión anterior) — en una DB vacía no hay nada nuevo que avisar.
    if (cache.length > 0) notify();
  })();

  return {
    getSnapshot() {
      return cache;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async insert(event) {
      await ready;
      await driver.insert(event);
      cache = [...cache, event];
      notify();
    },
    async findPending() {
      await ready;
      return driver.findPending();
    },
    async markSynced(eventIds) {
      await ready;
      await driver.markSynced(eventIds);
      const idSet = new Set(eventIds);
      cache = cache.map((e) => (idSet.has(e.eventId) ? { ...e, status: SYNC_STATUS.SYNCED } : e));
      notify();
    },
  };
}
