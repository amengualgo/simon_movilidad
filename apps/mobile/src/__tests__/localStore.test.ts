import { describe, it, expect, vi } from "vitest";
import { createInMemoryStore } from "../lib/localStore.js";
import { captureLocation, SYNC_STATUS } from "../offlineStore.js";

/**
 * `createInMemoryStore` implementa el mismo contrato `LocalStore` que ya
 * cubre offline-sync.test.ts (insert/findPending/markSynced) — aquí se
 * prueba además la capa de suscripción reactiva (`subscribe`/`getSnapshot`)
 * que usan los hooks de UI para evitar hacer polling del contador de
 * pendientes.
 */
describe("createInMemoryStore (capa reactiva sobre LocalStore)", () => {
  it("notifica a los suscriptores tras insert y tras markSynced (positivo)", async () => {
    const store = createInMemoryStore();
    const listener = vi.fn();
    store.subscribe(listener);

    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toHaveLength(1);

    const [event] = store.getSnapshot();
    await store.markSynced([event.eventId]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()[0].status).toBe(SYNC_STATUS.SYNCED);
  });

  it("deja de notificar tras unsubscribe (negativo)", async () => {
    const store = createInMemoryStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");
    expect(listener).not.toHaveBeenCalled();
  });

  it("findPending solo devuelve eventos no sincronizados (positivo)", async () => {
    const store = createInMemoryStore();
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");
    await captureLocation(store, { latitude: 4.61, longitude: -74.11 }, "v-1");
    const [first] = await store.findPending();
    await store.markSynced([first.eventId]);

    const pending = await store.findPending();
    expect(pending).toHaveLength(1);
  });
});
