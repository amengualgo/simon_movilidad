import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";

/**
 * Cubre DW-04 (drawer de detalle de vehículo): historial de posiciones,
 * distancia recorrida y datos de estado (zona/detenido desde). Ruta de solo
 * lectura, fuera del pipeline de ingesta asíncrona — mockeamos Prisma con el
 * mismo patrón usado en apps/ai-agent/src/__tests__/tools.test.ts.
 */
const vehicleStatuses: Record<string, any> = {
  "v-1": {
    vehicleId: "v-1",
    lastLat: 4.61,
    lastLng: -74.09,
    zoneId: "zona-a",
    lastMovedAt: new Date(Date.now() - 30 * 60_000),
    stoppedSince: null,
    updatedAt: new Date(Date.now() - 30 * 60_000),
  },
};

// v-1: dos eventos separados ~1 grado de latitud aparte (~111km), insertados
// en orden ascendente aquí para simular la BD; findMany se mockea respetando
// `orderBy` para poder verificar que la ruta no reordena en memoria. Timestamps
// relativos a "ahora" (no fijos) para no depender de la fecha en que corre el test.
const telemetryEvents: Record<string, any[]> = {
  "v-1": [
    { eventId: "e-1", vehicleId: "v-1", lat: 4.0, lng: -74.0, speedKmh: 40, zoneId: "zona-a", capturedAt: new Date(Date.now() - 60 * 60_000) },
    { eventId: "e-2", vehicleId: "v-1", lat: 5.0, lng: -74.0, speedKmh: 60, zoneId: "zona-a", capturedAt: new Date(Date.now() - 30 * 60_000) },
  ],
};

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    vehicleStatus: {
      findUnique: vi.fn(async ({ where }: any) => vehicleStatuses[where.vehicleId] ?? null),
    },
    telemetryEvent: {
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        const events = telemetryEvents[where.vehicleId] ?? [];
        const sorted = [...events].sort((a, b) =>
          orderBy.capturedAt === "desc"
            ? b.capturedAt.getTime() - a.capturedAt.getTime()
            : a.capturedAt.getTime() - b.capturedAt.getTime()
        );
        return sorted.filter((e) => e.capturedAt >= where.capturedAt.gte);
      }),
    },
  })),
}));

const vehiclesRoutes = (await import("../routes/vehicles.js")).default;

async function buildApp() {
  const app = Fastify();
  await app.register(vehiclesRoutes);
  return app;
}

describe("GET /vehicles/:vehicleId/history (DW-04)", () => {
  it("devuelve el historial con la forma esperada, posiciones más recientes primero y distancia calculada (positivo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/vehicles/v-1/history?minutes=120" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.vehicleId).toBe("v-1");
    expect(body.zoneId).toBe("zona-a");
    expect(body.stoppedSince).toBeNull();
    expect(body.positions).toHaveLength(2);
    expect(body.positions[0].eventId).toBe("e-2"); // más reciente primero
    expect(body.positions[1].eventId).toBe("e-1");
    expect(body.distanceKm).toBeGreaterThan(100);
    expect(body.distanceKm).toBeLessThan(120);
  });

  it("usa 120 minutos por defecto cuando no se pasa `minutes` (positivo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/vehicles/v-1/history" });

    expect(res.statusCode).toBe(200);
    expect(res.json().positions).toHaveLength(2);
  });

  it("responde 404 si el vehículo no existe en VehicleStatus (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/vehicles/no-existe/history" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "vehicle_not_found" });
  });

  it("responde 400 si `minutes` es negativo (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/vehicles/v-1/history?minutes=-5" });

    expect(res.statusCode).toBe(400);
  });

  it("responde 400 si `minutes` no es numérico (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/vehicles/v-1/history?minutes=abc" });

    expect(res.statusCode).toBe(400);
  });

  it("responde 400 si `minutes` excede el tope de 1440 (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/vehicles/v-1/history?minutes=99999" });

    expect(res.statusCode).toBe(400);
  });
});
