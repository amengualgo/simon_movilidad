import type { FastifyInstance } from "fastify";
import { registerWsClient } from "../lib/ws-broadcast.js";

/**
 * Canal de solo-lectura hacia el dashboard: posiciones/alertas en vivo.
 * Ver skill `websocket-patterns` para el contrato de reconexión esperado
 * en el cliente (backoff exponencial, no reintento inmediato en bucle).
 */
export default async function wsRoutes(app: FastifyInstance) {
  // @fastify/websocket v11 pasa el WebSocket crudo como primer argumento
  // (ya no el wrapper `{ socket }` de las versiones v8/v9 del plugin) —
  // el nombre del parámetro se mantiene "connection" solo por legibilidad.
  app.get("/ws/fleet", { websocket: true }, (connection) => {
    registerWsClient(connection);
  });
}
