import { describe, it, expect, vi } from "vitest";
import { createSqliteStore } from "../lib/localStore.js";
import { captureLocation, SYNC_STATUS, type LocalTelemetryEvent } from "../offlineStore.js";
import type { SqliteDriver } from "../lib/sqliteDriver.js";

/**
 * `createSqliteStore` implementa el mismo contrato `LocalStore` que ya
 * cubre offline-sync.test.ts (insert/findPending/markSynced) — aquí se
 * prueba además la capa reactiva (`subscribe`/`getSnapshot`) que usan los
 * hooks de UI, y la hidratación async desde el driver.
 *
 * Vitest corre en Node — no puede importar `expo-sqlite` (módulo nativo).
 * Por eso se inyecta un `SqliteDriver` falso en memoria en vez de mockear
 * el módulo: `createSqliteStore` nunca importa expo-sqlite directamente
 * (ver sqliteDriver.ts), así que esto ejercita el contrato real.
 */
function createFakeDriver(seed: LocalTelemetryEvent[] = []): SqliteDriver {
  let rows = [...seed];
  return {
    async init() {},
    async insert(event) {
      rows = [...rows, event];
    },
    async findAll() {
      return rows;
    },
    async findPending() {
      return rows.filter((e) => e.status === SYNC_STATUS.PENDING);
    },
    async markSynced(eventIds) {
      const idSet = new Set(eventIds);
      rows = rows.map((e) => (idSet.has(e.eventId) ? { ...e, status: SYNC_STATUS.SYNCED } : e));
    },
  };
}

describe("createSqliteStore (capa reactiva sobre LocalStore + SqliteDriver)", () => {
  it("notifica a los suscriptores tras insert y tras markSynced (positivo)", async () => {
    const store = createSqliteStore(createFakeDriver());
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
    const store = createSqliteStore(createFakeDriver());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");
    expect(listener).not.toHaveBeenCalled();
  });

  it("findPending solo devuelve eventos no sincronizados (positivo)", async () => {
    const store = createSqliteStore(createFakeDriver());
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");
    await captureLocation(store, { latitude: 4.61, longitude: -74.11 }, "v-1");
    const [first] = await store.findPending();
    await store.markSynced([first.eventId]);

    const pending = await store.findPending();
    expect(pending).toHaveLength(1);
  });

  it("hidrata desde el driver eventos pendientes de una sesión anterior (positivo)", async () => {
    const preexisting: LocalTelemetryEvent = {
      eventId: "e-previo",
      vehicleId: "v-1",
      lat: 4.6,
      lng: -74.1,
      capturedAt: new Date().toISOString(),
      status: SYNC_STATUS.PENDING,
    };
    const store = createSqliteStore(createFakeDriver([preexisting]));

    const pending = await store.findPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].eventId).toBe("e-previo");

    // getSnapshot() también debe reflejar la hidratación, no solo findPending().
    expect(store.getSnapshot().map((e) => e.eventId)).toContain("e-previo");
  });

  it("notifica a los suscriptores cuando hidrata filas preexistentes (negativo: no debe quedarse en snapshot vacío)", async () => {
    const preexisting: LocalTelemetryEvent = {
      eventId: "e-previo",
      vehicleId: "v-1",
      lat: 4.6,
      lng: -74.1,
      capturedAt: new Date().toISOString(),
      status: SYNC_STATUS.PENDING,
    };
    const store = createSqliteStore(createFakeDriver([preexisting]));
    const listener = vi.fn();
    store.subscribe(listener);

    await store.findPending(); // espera a que la hidratación termine
    expect(listener).toHaveBeenCalled();
  });
});
