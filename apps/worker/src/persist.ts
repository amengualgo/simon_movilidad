import { PrismaClient } from "@prisma/client";
import type { ValidatedTelemetryEvent } from "@fleet/shared";
import type { VehicleStatusUpdate } from "@fleet/shared";

export const prisma = new PrismaClient();

// Distancia mínima (en grados, aprox.) para considerar que el vehículo "se movió"
// en vez de ruido de GPS. En un escenario real usaríamos metros vía haversine;
// esta es una simplificación deliberada, documentada — ver PLAN.md.
const MOVEMENT_EPSILON = 0.0003;

/**
 * Persistencia idempotente: reintentar/reentregar el mismo evento (mismo eventId)
 * nunca crea una fila duplicada. Ver skill `rabbitmq-patterns`.
 * También actualiza VehicleStatus, la tabla que consulta el agente de IA.
 */
export async function persistTelemetryEvent(
  event: ValidatedTelemetryEvent,
): Promise<VehicleStatusUpdate> {
  await prisma.telemetryEvent.upsert({
    where: { eventId: event.eventId },
    create: {
      eventId: event.eventId,
      vehicleId: event.vehicleId,
      lat: event.lat,
      lng: event.lng,
      speedKmh: event.speedKmh,
      zoneId: event.zoneId,
      capturedAt: new Date(event.capturedAt),
    },
    update: {}, // ya existe: no-op, es una reentrega
  });

  const previous = await prisma.vehicleStatus.findUnique({ where: { vehicleId: event.vehicleId } });

  const moved =
    !previous ||
    Math.abs(previous.lastLat - event.lat) > MOVEMENT_EPSILON ||
    Math.abs(previous.lastLng - event.lng) > MOVEMENT_EPSILON;

  const now = new Date(event.capturedAt);
  const stoppedSince = moved ? null : (previous?.stoppedSince ?? now);

  const status = await prisma.vehicleStatus.upsert({
    where: { vehicleId: event.vehicleId },
    create: {
      vehicleId: event.vehicleId,
      lastLat: event.lat,
      lastLng: event.lng,
      zoneId: event.zoneId,
      lastMovedAt: now,
      stoppedSince: null,
    },
    update: {
      lastLat: event.lat,
      lastLng: event.lng,
      zoneId: event.zoneId,
      lastMovedAt: moved ? now : previous!.lastMovedAt,
      stoppedSince,
    },
  });

  return {
    vehicleId: status.vehicleId,
    lat: status.lastLat,
    lng: status.lastLng,
    zoneId: status.zoneId ?? undefined,
    stoppedSince: status.stoppedSince?.toISOString() ?? null,
    updatedAt: status.updatedAt.toISOString(),
  };
}
