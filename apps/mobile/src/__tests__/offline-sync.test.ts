import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureLocation, SYNC_STATUS, type LocalStore, type LocalTelemetryEvent } from "../offlineStore.js";
import { syncPendingEvents } from "../syncWorker.js";

/**
 * Cubre DM-01 (captura local siempre disponible), DM-02 (offline no pierde
 * datos), DM-03 (confirmación de sync sin duplicados). Se usa un LocalStore
 * en memoria — el driver real (WatermelonDB/expo-sqlite) se conecta cuando
 * se inicialice el proyecto Expo, pero el contrato de idempotencia se puede
 * validar por completo sin él.
 */
function createInMemoryStore(): LocalStore & { events: LocalTelemetryEvent[] } {
  const events: LocalTelemetryEvent[] = [];
  return {
    events,
    async insert(event) {
      events.push(event);
    },
    async findPending() {
      return events.filter((e) => e.status === SYNC_STATUS.PENDING);
    },
    async markSynced(eventIds) {
      for (const e of events) {
        if (eventIds.includes(e.eventId)) e.status = SYNC_STATUS.SYNCED;
      }
    },
  };
}

describe("captureLocation (DM-01)", () => {
  it("guarda el evento localmente en estado pending, sin tocar red (positivo)", async () => {
    const store = createInMemoryStore();
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");

    expect(store.events).toHaveLength(1);
    expect(store.events[0].status).toBe(SYNC_STATUS.PENDING);
    expect(store.events[0].eventId).toBeTruthy(); // generado en dispositivo, no vacío
  });

  it("relanza el error si la escritura local falla, en vez de perder el evento en silencio (negativo)", async () => {
    const brokenStore: LocalStore = {
      insert: vi.fn().mockRejectedValue(new Error("disk full")),
      findPending: vi.fn(),
      markSynced: vi.fn(),
    };

    await expect(captureLocation(brokenStore, { latitude: 4.6, longitude: -74.1 }, "v-1")).rejects.toThrow(
      "disk full",
    );
  });
});

describe("syncPendingEvents (DM-02 / DM-03)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = originalFetch;
  });

  it("no hace ninguna llamada de red si no hay eventos pendientes (positivo)", async () => {
    const store = createInMemoryStore();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;

    await syncPendingEvents(store);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envía todos los pendientes en UN solo batch y los marca synced (positivo)", async () => {
    const store = createInMemoryStore();
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");
    await captureLocation(store, { latitude: 4.61, longitude: -74.11 }, "v-1");

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as any;

    await syncPendingEvents(store);

    expect(fetchSpy).toHaveBeenCalledOnce(); // un solo request, no uno por coordenada
    expect(store.events.every((e) => e.status === SYNC_STATUS.SYNCED)).toBe(true);
  });

  it("deja los eventos en pending si la respuesta del servidor no es ok (negativo)", async () => {
    const store = createInMemoryStore();
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");

    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;

    await syncPendingEvents(store);

    expect(store.events[0].status).toBe(SYNC_STATUS.PENDING);
  });

  it("deja los eventos en pending si la red falla a mitad de sync (negativo — recuperable en el próximo intento)", async () => {
    const store = createInMemoryStore();
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");

    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as any;

    await expect(syncPendingEvents(store)).resolves.not.toThrow();
    expect(store.events[0].status).toBe(SYNC_STATUS.PENDING);
  });

  it("un segundo sync tras uno exitoso no reenvía eventos ya sincronizados (negativo — idempotencia de extremo a extremo)", async () => {
    const store = createInMemoryStore();
    await captureLocation(store, { latitude: 4.6, longitude: -74.1 }, "v-1");

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as any;

    await syncPendingEvents(store); // primer sync: 1 evento
    await syncPendingEvents(store); // segundo sync: no debería haber pendientes

    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
