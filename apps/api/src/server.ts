import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import websocketPlugin from "@fastify/websocket";

import { connectRabbitMQ, closeRabbitMQ, getChannel } from "./lib/rabbitmq.js";
import { subscribeToBroadcastExchange } from "./lib/ws-broadcast.js";
import telemetryRoutes from "./routes/telemetry.js";
import chatRoutes from "./routes/chat.js";
import vehiclesRoutes from "./routes/vehicles.js";
import healthRoutes from "./routes/health.js";
import wsRoutes from "./routes/ws.js";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3000);

/**
 * Todo el arranque (registro de plugins/rutas + conexión a RabbitMQ) vive
 * dentro de start(), envuelto por el .catch() de abajo. Si el registro de
 * un plugin quedaba como un `await` de nivel superior fuera de esta
 * función, un fallo ahí se propagaba como un rechazo de promesa no
 * manejado — Node lo reporta, pero sin pasar por app.log (formato
 * inconsistente con el resto de los logs, y sin control sobre el código de
 * salida del proceso).
 */
async function start() {
  await app.register(cors, { origin: true });
  await app.register(helmet);
  // global: false — un límite global habría estrangulado la ingesta de
  // telemetría (RabbitMQ + prefetch del worker ya hacen de backpressure ahí).
  // Solo /chat lo activa explícitamente, ver routes/chat.ts.
  await app.register(rateLimit, { global: false });
  await app.register(websocketPlugin);

  await app.register(healthRoutes);
  await app.register(telemetryRoutes);
  await app.register(chatRoutes);
  await app.register(vehiclesRoutes);
  await app.register(wsRoutes);

  await connectRabbitMQ();
  // La API se suscribe al exchange de broadcast del worker para retransmitir por WS.
  // Ver lib/ws-broadcast.ts — el worker es la única fuente de "qué cambió".
  await subscribeToBroadcastExchange(getChannel());

  await app.listen({ port, host: "0.0.0.0" });
}

async function shutdown() {
  app.log.info("Shutting down gracefully...");
  try {
    await app.close();
    await closeRabbitMQ();
  } catch (err) {
    app.log.error({ err }, "Error during shutdown");
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
