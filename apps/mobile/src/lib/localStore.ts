import { SYNC_STATUS, type LocalStore, type LocalTelemetryEvent } from "../offlineStore.js";

/**
 * Implementación EN MEMORIA de `LocalStore`, usada mientras no se conecte un
 * driver de storage real (WatermelonDB o `expo-sqlite`) — ver README.md de
 * esta carpeta, sección "Gaps documentados". Implementa exactamente el mismo
 * contrato que `offlineStore.ts`/`syncWorker.ts` ya esperan (insert /
 * findPending / markSynced), así que sustituirla por un adaptador real más
 * adelante no debería tocar ni la lógica de captura ni la de sync, solo este
 * archivo.
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

export function createInMemoryStore(): ReactiveLocalStore {
  let events: LocalTelemetryEvent[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    getSnapshot() {
      return events;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async insert(event) {
      events = [...events, event];
      notify();
    },
    async findPending() {
      return events.filter((e) => e.status === SYNC_STATUS.PENDING);
    },
    async markSynced(eventIds) {
      const idSet = new Set(eventIds);
      events = events.map((e) => (idSet.has(e.eventId) ? { ...e, status: SYNC_STATUS.SYNCED } : e));
      notify();
    },
  };
}
