import type { FastifyInstance } from "fastify";
import { rawTelemetrySchema, telemetryBatchSchema } from "@fleet/shared";
import { publishTelemetryEvent } from "../lib/rabbitmq.js";

/**
 * Ingesta asíncrona. Ver skill `rabbitmq-patterns`.
 * IMPORTANTE: aquí solo se valida FORMA (shape), nunca reglas de negocio
 * (rangos de coordenadas, existencia del vehículo, zonas válidas). Esa
 * validación completa vive en el worker consumidor, no aquí. La API nunca
 * espera a que el evento se valide ni se persista — responde 202 de inmediato.
 */
export default async function telemetryRoutes(app: FastifyInstance) {
  app.post("/telemetry", async (request, reply) => {
    const parsed = rawTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_shape", details: parsed.error.flatten() });
    }

    try {
      await publishTelemetryEvent(parsed.data, parsed.data.eventId);
    } catch (err) {
      // publishTelemetryEvent lanza en backpressure del broker (buffer
      // lleno) o si la conexión cayó — nunca debe devolverse como un 500
      // genérico de Fastify (leak de stack trace); el cliente debe poder
      // distinguir "reintenta" de "tu payload está mal".
      request.log.error({ err }, "Failed to publish telemetry event to RabbitMQ");
      return reply.code(503).send({ error: "ingestion_unavailable" });
    }

    return reply.code(202).send({ accepted: true, eventId: parsed.data.eventId });
  });

  /**
   * Usado por la app móvil al reconectar tras un período offline.
   * Ver skill `mobile-offline-sync`: reutiliza el MISMO pipeline de ingesta,
   * no hay una ruta de ingesta paralela para el caso "batch".
   */
  app.post("/telemetry/batch", async (request, reply) => {
    const parsed = telemetryBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_shape", details: parsed.error.flatten() });
    }

    try {
      for (const event of parsed.data.events) {
        await publishTelemetryEvent(event, event.eventId);
      }
    } catch (err) {
      // Publicación parcial es segura de reintentar: los eventos ya
      // publicados son idempotentes (mismo eventId), y el cliente móvil
      // deja el lote completo como "pending" hasta la próxima reconexión
      // (ver skill `mobile-offline-sync`) — no hay estado corrupto que limpiar.
      request.log.error({ err }, "Failed to publish telemetry batch to RabbitMQ");
      return reply.code(503).send({ error: "ingestion_unavailable" });
    }

    return reply.code(202).send({ accepted: parsed.data.events.length });
  });
}
