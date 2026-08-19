import Fastify from "fastify";
import { z } from "zod";
import { answerFleetQuery } from "./agent.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok" }));

const querySchema = z.object({ query: z.string().min(1).max(500) });

app.post("/query", async (request, reply) => {
  const parsed = querySchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });

  try {
    const answer = await answerFleetQuery(parsed.data.query);
    return reply.send({ answer });
  } catch (err) {
    // El circuit breaker de la API principal (apps/api/src/lib/circuit-breaker.ts)
    // cuenta cualquier respuesta no-ok como fallo, así que un 500 aquí SÍ
    // alimenta correctamente esa lógica de resiliencia. Pero igual logueamos
    // el detalle real server-side y devolvemos un mensaje genérico al
    // cliente — no queremos filtrar el mensaje de error interno del
    // proveedor de LLM (podría incluir detalles de la petición) en la respuesta HTTP.
    request.log.error({ err }, "answerFleetQuery failed");
    return reply.code(500).send({ error: "agent_query_failed" });
  }
});

const port = Number(process.env.PORT ?? 3002);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
