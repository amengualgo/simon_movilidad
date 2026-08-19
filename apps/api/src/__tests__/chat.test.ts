import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";

/**
 * Cubre DW-03 (consultas a la flota en lenguaje natural) y su contraparte
 * de resiliencia: cuando el agente de IA está caído, el circuit breaker
 * debe degradar con un mensaje claro, NUNCA colgar la petición ni tirar un
 * 500 sin explicación. Este es el caso de prueba que justifica por qué el
 * patrón NO es un simple try/catch — ver skill `circuit-breaker-patterns`.
 */
const chatRoutes = (await import("../routes/chat.js")).default;

async function buildApp() {
  const app = Fastify();
  await app.register(chatRoutes);
  return app;
}

describe("POST /chat (DW-03)", () => {
  it("rechaza un query vacío antes de tocar el circuit breaker (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/chat", payload: { query: "" } });

    expect(res.statusCode).toBe(400);
  });

  it("rechaza un query que excede el largo máximo (negativo)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/chat", payload: { query: "a".repeat(501) } });

    expect(res.statusCode).toBe(400);
  });

  // Nota: el caso "agente caído -> respuesta degradada del fallback" se
  // prueba de forma más directa y aislada en circuit-breaker.test.ts,
  // forzando fallos consecutivos sobre el breaker en sí — probarlo aquí
  // requeriría mockear fetch() global y opossum's internal state machine,
  // acoplando el test de la ruta a detalles de implementación del breaker.
});
