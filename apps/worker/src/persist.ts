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
    // "ya existe: no-op, es una reentrega" — pero un `update: {}` vacío hace
    // que Prisma no genere la cláusula ON CONFLICT DO UPDATE real (cae a un
    // INSERT plano sin protección de conflicto), así que una reentrega del
    // mismo eventId termina lanzando P2002 (unique constraint) en vez de
    // absorberse en silencio, confirmado en producción con el driver
    // idempotente de apps/mobile. Reasignar eventId a sí mismo fuerza un
    // ON CONFLICT DO UPDATE real (no cambia ningún dato) sin perder la
    // semántica de no-op.
    update: { eventId: event.eventId },
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
