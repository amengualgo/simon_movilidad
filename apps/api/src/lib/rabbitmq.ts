import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import pino from "pino";
import { RABBITMQ_TOPOLOGY } from "@fleet/shared";

const log = pino({ name: "api-rabbitmq" });

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;

/**
 * Ver skill `rabbitmq-patterns`. Topología:
 * - exchange "telemetry" (direct) -> queue "telemetry.raw" -> worker consumidor
 * - DLX "telemetry.dlx" -> queue "telemetry.dead-letter" (mensajes irrecuperables)
 * - exchange "telemetry.broadcast" (fanout) -> el worker publica aquí tras persistir,
 *   la API lo consume para retransmitir por WebSocket a los clientes del dashboard.
 */
export async function connectRabbitMQ(): Promise<ConfirmChannel> {
  connection = await amqp.connect(process.env.RABBITMQ_URL ?? "amqp://localhost:5672");

  // Sin estos listeners, un error/cierre asíncrono de la conexión (ej. el
  // broker reinicia) emite "error" sin handler y Node tumba el proceso sin
  // pasar por nuestro logger — el crash más silencioso posible.
  connection.on("error", (err) => log.error({ err }, "RabbitMQ connection error"));
  connection.on("close", () => log.warn("RabbitMQ connection closed"));

  // createConfirmChannel() (no createChannel() + confirmSelect() manual) es
  // el canal ya en modo "publisher confirms" — createChannel() devuelve un
  // Channel plano que ni siquiera expone confirmSelect() en sus tipos.
  channel = await connection.createConfirmChannel();
  channel.on("error", (err) => log.error({ err }, "RabbitMQ channel error"));
  channel.on("close", () => log.warn("RabbitMQ channel closed"));

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

  await channel.assertQueue(RABBITMQ_TOPOLOGY.queueDeadLetter, { durable: true });
  await channel.bindQueue(
    RABBITMQ_TOPOLOGY.queueDeadLetter,
    RABBITMQ_TOPOLOGY.dlxExchange,
    RABBITMQ_TOPOLOGY.routingKeyDeadLetter,
  );

  return channel;
}

export function getChannel(): ConfirmChannel {
  if (!channel) throw new Error("RabbitMQ channel not initialized — call connectRabbitMQ() first");
  return channel;
}

/** Publisher confirms: no es fire-and-forget silencioso, sabemos si el broker aceptó el mensaje. */
export async function publishTelemetryEvent(event: unknown, eventId: string): Promise<void> {
  const ch = getChannel();
  const ok = ch.publish(
    RABBITMQ_TOPOLOGY.exchange,
    RABBITMQ_TOPOLOGY.routingKeyRaw,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, messageId: eventId, contentType: "application/json" },
  );
  if (!ok) {
    throw new Error("RabbitMQ publish buffer full, apply backpressure");
  }
}

export async function closeRabbitMQ(): Promise<void> {
  try {
    await channel?.close();
    await connection?.close();
  } catch (err) {
    // No relanzar: esto corre durante shutdown, y fallar aquí no debe
    // impedir que el proceso termine limpiamente.
    log.warn({ err }, "Error closing RabbitMQ connection during shutdown");
  }
}
