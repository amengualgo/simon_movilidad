import { z } from "zod";

/**
 * Validación estructural mínima (usada por la API en el hot path de ingesta).
 * NO valida reglas de negocio (rangos de coordenadas realistas, existencia del
 * vehículo, etc.) — eso ocurre en el worker, después de publicar en RabbitMQ.
 * Ver skill `rabbitmq-patterns`.
 */
export const rawTelemetrySchema = z.object({
  eventId: z.string().uuid(),
  vehicleId: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  speedKmh: z.number().nonnegative().optional(),
  zoneId: z.string().optional(),
  capturedAt: z.string().datetime(),
});

export type RawTelemetryEvent = z.infer<typeof rawTelemetrySchema>;

/**
 * Validación completa de negocio, aplicada SOLO dentro del worker consumidor.
 */
export const validatedTelemetrySchema = rawTelemetrySchema.extend({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type ValidatedTelemetryEvent = z.infer<typeof validatedTelemetrySchema>;

export const telemetryBatchSchema = z.object({
  events: z.array(rawTelemetrySchema).min(1).max(500),
});

export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;
