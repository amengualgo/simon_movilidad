import type { WebSocket } from "ws";
import type { Channel } from "amqplib";
import pino from "pino";
import { RABBITMQ_TOPOLOGY, type WsMessage } from "@fleet/shared";

const log = pino({ name: "api-ws-broadcast" });

const clients = new Set<WebSocket>();

export function registerWsClient(socket: WebSocket): void {
  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", (err: Error) => log.warn({ err }, "WebSocket client error"));
}

function broadcast(message: WsMessage): void {
  const payload = JSON.stringify(message);
  for (const socket of clients) {
    try {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    } catch (err) {
      // Un socket individual roto no debe impedir la retransmisión al resto.
      log.warn({ err }, "Failed to send to a WebSocket client, skipping it");
    }
  }
}

/**
 * Ver skill `websocket-patterns`. La API NO decide cuándo emitir un update —
 * solo retransmite lo que el worker publica en el exchange fanout de broadcast
 * tras persistir un evento válido. Esto mantiene una única fuente de verdad
 * (el worker) para "qué cambió", evitando updates duplicados o prematuros.
 */
export async function subscribeToBroadcastExchange(channel: Channel): Promise<void> {
  const { queue } = await channel.assertQueue("", { exclusive: true });
  await channel.bindQueue(queue, RABBITMQ_TOPOLOGY.broadcastExchange, "");

  await channel.consume(queue, (msg) => {
    if (!msg) return;
    try {
      const message = JSON.parse(msg.content.toString()) as WsMessage;
      broadcast(message);
    } catch (err) {
      // No debería ocurrir (solo el worker publica aquí), pero un mensaje
      // malformado en este exchange NUNCA debe tumbar el callback de
      // consumo sin loguearse — eso dejaría de retransmitir en silencio.
      log.error({ err }, "Failed to process broadcast message, dropping it");
    } finally {
      channel.ack(msg);
    }
  });
}
