import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { VehicleHistoryResponse, VehiclePosition } from "@fleet/shared";
import { prisma } from "../lib/prisma.js";

const paramsSchema = z.object({ vehicleId: z.string().min(1) });

/**
 * `minutes` llega como string desde la query — coerce a number y luego
 * valida rango. Tope en 1440 (24h) para no permitir un scan sin límite
 * sobre telemetry_events (no hay TimescaleDB/continuous aggregates, ver
 * simplificación documentada en README/PLAN.md).
 */
const querySchema = z.object({
  minutes: z.coerce.number().positive().max(1440).default(120),
});

/**
 * Fórmula de haversine, distancia en km entre dos puntos lat/lng.
 * Implementada localmente (sin dependencia nueva) solo para sumar la
 * distancia recorrida entre posiciones consecutivas del historial.
 */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/**
 * GET /vehicles/:vehicleId/history — drawer de detalle de vehículo (DW-04).
 * Ruta de solo lectura, fuera del pipeline de ingesta asíncrona: consulta
 * Postgres directamente (mismo patrón que apps/ai-agent/src/tools.ts).
 */
export default async function vehiclesRoutes(app: FastifyInstance) {
  app.get("/vehicles/:vehicleId/history", async (request, reply) => {
    const parsedParams = paramsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_vehicle_id" });
    }

    const parsedQuery = querySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "invalid_minutes", details: parsedQuery.error.flatten() });
    }

    const { vehicleId } = parsedParams.data;
    const { minutes } = parsedQuery.data;

    try {
      const status = await prisma.vehicleStatus.findUnique({ where: { vehicleId } });
      if (!status) {
        return reply.code(404).send({ error: "vehicle_not_found" });
      }

      const since = new Date(Date.now() - minutes * 60_000);
      const events = await prisma.telemetryEvent.findMany({
        where: { vehicleId, capturedAt: { gte: since } },
        orderBy: { capturedAt: "desc" },
      });

      // La distancia se suma en orden cronológico (más antiguo -> más
      // reciente), aunque `events`/`positions` se devuelven newest-first
      // para la tabla del dashboard.
      const chronological = [...events].reverse();
      let distanceKm = 0;
      for (let i = 1; i < chronological.length; i++) {
        distanceKm += haversineKm(chronological[i - 1]!, chronological[i]!);
      }

      const positions: VehiclePosition[] = events.map((e) => ({
        eventId: e.eventId,
        lat: e.lat,
        lng: e.lng,
        speedKmh: e.speedKmh ?? null,
        capturedAt: e.capturedAt.toISOString(),
      }));

      const response: VehicleHistoryResponse = {
        vehicleId: status.vehicleId,
        zoneId: status.zoneId ?? null,
        stoppedSince: status.stoppedSince ? status.stoppedSince.toISOString() : null,
        lastMovedAt: status.lastMovedAt.toISOString(),
        distanceKm,
        positions,
      };

      return reply.send(response);
    } catch (err) {
      // No dejar que un fallo de Postgres se propague como el 500 genérico
      // de Fastify (leak de stack trace) — mismo estándar que telemetry.ts/chat.ts.
      request.log.error({ err, vehicleId }, "Failed to load vehicle history");
      return reply.code(503).send({ error: "history_unavailable" });
    }
  });
}
