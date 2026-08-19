import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

/**
 * Cubre DW-01/DM-02: la ruta de ingesta nunca debe bloquear esperando
 * validación de negocio (eso vive en el worker) — solo valida forma y
 * publica. Mockeamos publishTelemetryEvent para no requerir RabbitMQ real.
 */
vi.mock("../lib/rabbitmq.js", () => ({
  publishTelemetryEvent: vi.fn().mockResolvedValue(undefined),
}));

const { publishTelemetryEvent } = await import("../lib/rabbitmq.js");
const telemetryRoutes = (await import("../routes/telemetry.js")).default;

async function buildApp() {
  const app = Fastify();
  await app.register(telemetryRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const validEvent = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  vehicleId: "v-1",
  lat: 4.6,
  lng: -74.1,
  capturedAt: new Date().toISOString(),
};

describe("POST /telemetry (DW-01 / DM-02)", () => {
  it("responde 202 inmediatamente y publica el evento sin esperar validación de negocio (positivo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/telemetry", payload: validEvent });

    expect(res.statusCode).toBe(202);
    expect(publishTelemetryEvent).toHaveBeenCalledOnce();
  });

  it("rechaza un payload con forma inválida antes de publicar (negativo — este es el 5% de k6/load-test.js)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/telemetry",
      payload: { lat: 999, capturedAt: "not-a-date" },
    });

    expect(res.statusCode).toBe(400);
    expect(publishTelemetryEvent).not.toHaveBeenCalled();
  });

  it("responde 503 (no un 500 genérico) si RabbitMQ rechaza la publicación (negativo — backpressure/conexión caída)", async () => {
    vi.mocked(publishTelemetryEvent).mockRejectedValueOnce(new Error("RabbitMQ publish buffer full"));
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/telemetry", payload: validEvent });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "ingestion_unavailable" });
  });
});

describe("POST /telemetry/batch (DM-02 / DM-03 — sync offline de la app móvil)", () => {
  it("acepta un lote y publica cada evento por separado al mismo pipeline (positivo)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/telemetry/batch",
      payload: { events: [validEvent, { ...validEvent, eventId: "660e8400-e29b-41d4-a716-446655440001" }] },
    });

    expect(res.statusCode).toBe(202);
    expect(publishTelemetryEvent).toHaveBeenCalledTimes(2);
  });

  it("rechaza un lote vacío (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/telemetry/batch", payload: { events: [] } });

    expect(res.statusCode).toBe(400);
  });

  it("responde 503 si falla la publicación a mitad de lote (negativo — el resto ya publicado es seguro de reintentar por idempotencia)", async () => {
    vi.mocked(publishTelemetryEvent).mockRejectedValueOnce(new Error("connection closed"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/telemetry/batch",
      payload: { events: [validEvent] },
    });

    expect(res.statusCode).toBe(503);
  });
});
