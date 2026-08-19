import amqp, { type Channel } from "amqplib";
import pino from "pino";
import { validatedTelemetrySchema, RABBITMQ_TOPOLOGY, WS_MESSAGE_TYPE, type WsMessage } from "@fleet/shared";
import { persistTelemetryEvent } from "./persist.js";

const log = pino({ name: "telemetry-worker" });

/**
 * Consumidor de la cola "telemetry.raw". Ver skill `rabbitmq-patterns`.
 * - Ack manual, SOLO tras persistencia exitosa (nunca noAck: true).
 * - Payload inválido -> nack sin requeue -> va al dead-letter automáticamente
 *   (la cola está configurada con x-dead-letter-exchange en la API).
 * - Error transitorio (ej. DB caída) -> nack con requeue -> reintento.
 * - Tras persistir, publica en el exchange fanout de broadcast para que la
 *   API lo retransmita por WebSocket. El worker es la única fuente de verdad
 *   de "qué cambió" — la API nunca decide esto por sí misma.
 */
async function start() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL ?? "amqp://localhost:5672");
  connection.on("error", (err) => log.error({ err }, "RabbitMQ connection error"));
  connection.on("close", () => log.warn("RabbitMQ connection closed"));

  const channel: Channel = await connection.createChannel();
  channel.on("error", (err) => log.error({ err }, "RabbitMQ channel error"));
  channel.on("close", () => log.warn("RabbitMQ channel closed"));

  await channel.prefetch(20);

  // Aseguramos la misma topología que la API por si el worker arranca primero.
  await channel.assertExchange(RABBITMQ_TOPOLOGY.exchange, "direct", { durable: true });
  await channel.assertExchange(RABBITMQ_TOPOLOGY.dlxExchange, "direct", { durable: true });
  await channel.assertExchange(RABBITMQ_TOPOLOGY.broadcastExchange, "fanout", { durable: false });
  await channel.assertQueue(RABBITMQ_TOPOLOGY.queueRaw, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": RABBITMQ_TOPOLOGY.dlxExchange,
      "x-dead-letter-routing-key": RABBITMQ_TOPOLOGY.routingKeyDeadLetter,
    },
  });
  await channel.bindQueue(RABBITMQ_TOPOLOGY.queueRaw, RABBITMQ_TOPOLOGY.exchange, RABBITMQ_TOPOLOGY.routingKeyRaw);

  log.info("Worker listening on telemetry.raw");

  channel.consume(RABBITMQ_TOPOLOGY.queueRaw, async (msg) => {
    if (!msg) return;

    let raw: unknown;
    try {
      raw = JSON.parse(msg.content.toString());
    } catch {
      log.warn("Malformed JSON payload, sending to dead-letter");
      channel.nack(msg, false, false);
      return;
    }

    const parsed = validatedTelemetrySchema.safeParse(raw);
    if (!parsed.success) {
      log.warn({ errors: parsed.error.flatten() }, "Business validation failed, sending to dead-letter");
      channel.nack(msg, false, false);
      return;
    }

    try {
      const statusUpdate = await persistTelemetryEvent(parsed.data);

      const broadcastMessage: WsMessage = { type: WS_MESSAGE_TYPE.TELEMETRY_UPDATE, data: statusUpdate };
      channel.publish(RABBITMQ_TOPOLOGY.broadcastExchange, "", Buffer.from(JSON.stringify(broadcastMessage)));

      channel.ack(msg);
    } catch (err) {
      log.error({ err }, "Transient error persisting event, requeueing");
      channel.nack(msg, false, true);
    }
  });

  process.on("SIGTERM", async () => {
    try {
      await channel.close();
      await connection.close();
    } catch (err) {
      log.warn({ err }, "Error closing RabbitMQ connection during shutdown");
    } finally {
      process.exit(0);
    }
  });
}

start().catch((err) => {
  log.error(err);
  process.exit(1);
});
