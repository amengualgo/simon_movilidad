import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cubre la garantía de idempotencia que sostiene DW-01 (mapa en vivo
 * confiable) y DM-02/DM-03 (sync offline sin duplicar): reentregar el mismo
 * eventId (por reintento de RabbitMQ o por un batch offline re-sincronizado)
 * nunca debe crear una fila duplicada ni corromper VehicleStatus.
 *
 * Se mockea PrismaClient en memoria en vez de requerir una Postgres real —
 * mantiene el test rápido y determinista. La integración con una DB real
 * queda cubierta por el flujo end-to-end sugerido en README.md.
 */

const telemetryEvents = new Map<string, any>();
const vehicleStatuses = new Map<string, any>();

vi.mock("@prisma/client", () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      telemetryEvent: {
        upsert: vi.fn(async ({ where, create }) => {
          const exists = telemetryEvents.has(where.eventId);
          if (!exists) telemetryEvents.set(where.eventId, create);
          return telemetryEvents.get(where.eventId);
        }),
      },
      vehicleStatus: {
        findUnique: vi.fn(async ({ where }) => vehicleStatuses.get(where.vehicleId) ?? null),
        // Prisma stampa `updatedAt` automáticamente (columna `@updatedAt` en el
        // schema) en cada create/update real — el mock tiene que replicar eso,
        // si no `status.updatedAt` llega undefined y `persistTelemetryEvent`
        // revienta en `.toISOString()` con un error que no existe contra una
        // Postgres real.
        upsert: vi.fn(async ({ where, create, update }) => {
          const existing = vehicleStatuses.get(where.vehicleId);
          const next = existing ? { ...existing, ...update, updatedAt: new Date() } : { ...create, updatedAt: new Date() };
          vehicleStatuses.set(where.vehicleId, next);
          return next;
        }),
      },
    })),
  };
});

const { persistTelemetryEvent } = await import("../persist.js");

beforeEach(() => {
  telemetryEvents.clear();
  vehicleStatuses.clear();
});

const baseEvent = {
  eventId: "evt-1",
  vehicleId: "v-1",
  lat: 4.6,
  lng: -74.1,
  capturedAt: new Date("2026-08-18T10:00:00Z").toISOString(),
};

describe("persistTelemetryEvent — idempotencia (DW-01 / DM-02 / DM-03)", () => {
  it("crea el evento y el estado del vehículo en la primera entrega (positivo)", async () => {
    const status = await persistTelemetryEvent(baseEvent);
    expect(telemetryEvents.size).toBe(1);
    expect(status.vehicleId).toBe("v-1");
    expect(status.stoppedSince).toBeNull(); // primer evento: no hay base para comparar movimiento
  });

  it("una reentrega del MISMO eventId no duplica la fila (negativo — es el caso que k6 simula al 10%)", async () => {
    await persistTelemetryEvent(baseEvent);
    await persistTelemetryEvent(baseEvent); // reentrega idéntica

    expect(telemetryEvents.size).toBe(1);
  });

  it("marca stoppedSince cuando dos eventos consecutivos no cambian de posición (soporta DW-01 alertas de detención)", async () => {
    await persistTelemetryEvent(baseEvent);
    const second = await persistTelemetryEvent({
      ...baseEvent,
      eventId: "evt-2",
      capturedAt: new Date("2026-08-18T10:05:00Z").toISOString(),
    });

    expect(second.stoppedSince).not.toBeNull();
  });

  it("limpia stoppedSince cuando el vehículo se mueve (lat/lng cambian más allá del epsilon)", async () => {
    await persistTelemetryEvent(baseEvent);
    await persistTelemetryEvent({
      ...baseEvent,
      eventId: "evt-2",
      capturedAt: new Date("2026-08-18T10:05:00Z").toISOString(),
    });
    const moved = await persistTelemetryEvent({
      ...baseEvent,
      eventId: "evt-3",
      lat: baseEvent.lat + 0.01, // supera MOVEMENT_EPSILON
      capturedAt: new Date("2026-08-18T10:10:00Z").toISOString(),
    });

    expect(moved.stoppedSince).toBeNull();
  });
});
