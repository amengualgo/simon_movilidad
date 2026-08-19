import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiAgentBreaker } from "../lib/circuit-breaker.js";

const chatQuerySchema = z.object({ query: z.string().min(1).max(500) });

/**
 * Punto de entrada del chat del dashboard hacia el agente de IA.
 * La llamada real va envuelta en el circuit breaker — ver skill
 * `circuit-breaker-patterns`. Si el agente está caído, esto NO cuelga
 * la petición: devuelve el fallback definido en circuit-breaker.ts.
 */
export default async function chatRoutes(app: FastifyInstance) {
  app.post(
    "/chat",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = chatQuerySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }

      const result = await aiAgentBreaker.fire(parsed.data.query);
      return reply.send(result);
    },
  );
}
