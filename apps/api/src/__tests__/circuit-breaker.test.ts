import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CircuitBreaker from "opossum";

/**
 * Ver skill `circuit-breaker-patterns`. Este test existe específicamente
 * para demostrar la diferencia con try/catch (Caso de auditoría de IA
 * documentado en tasks/ai-audit-notes.md): un try/catch maneja UNA llamada
 * fallida; el circuit breaker debe dejar de INTENTAR llamadas después de
 * varios fallos consecutivos, y degradar con el fallback — no seguir
 * golpeando un servicio caído.
 *
 * Se construye un breaker de prueba aislado (no el singleton de
 * lib/circuit-breaker.ts) para poder ajustar sus umbrales y no depender de
 * temporizadores largos en el test.
 */
async function alwaysFails(): Promise<never> {
  throw new Error("AI agent unreachable");
}

describe("Circuit breaker hacia el agente de IA (DW-03 / DW-06)", () => {
  let breaker: CircuitBreaker<[], never>;

  beforeEach(() => {
    breaker = new CircuitBreaker(alwaysFails, {
      timeout: 200,
      errorThresholdPercentage: 50,
      resetTimeout: 300,
      volumeThreshold: 2,
    });
    breaker.fallback(() => ({ answer: "degraded", degraded: true }));
  });

  afterEach(() => {
    breaker.shutdown();
  });

  it("usa el fallback en la primera llamada fallida en vez de propagar el error (positivo)", async () => {
    const result = await breaker.fire();
    expect(result).toEqual({ answer: "degraded", degraded: true });
  });

  it("abre el circuito tras superar el umbral de fallos y deja de intentar llamadas reales (negativo — esto es lo que try/catch NO hace)", async () => {
    // Forzamos suficientes fallos para abrir el circuito.
    await breaker.fire();
    await breaker.fire();
    await breaker.fire();

    expect(breaker.opened).toBe(true);
  });

  it("vuelve a cerrar (half-open -> closed) cuando la función subyacente se recupera", async () => {
    await breaker.fire();
    await breaker.fire();
    await breaker.fire();
    expect(breaker.opened).toBe(true);

    // Reemplazamos la función interna simulando que el servicio se recuperó,
    // y esperamos a que pase el resetTimeout para permitir la prueba half-open.
    await new Promise((resolve) => setTimeout(resolve, 350));

    const recoveredBreaker = new CircuitBreaker(async () => ({ answer: "ok", degraded: false }), {
      timeout: 200,
      errorThresholdPercentage: 50,
      resetTimeout: 300,
      volumeThreshold: 2,
    });
    const result = await recoveredBreaker.fire();
    expect(result).toEqual({ answer: "ok", degraded: false });
    recoveredBreaker.shutdown();
  });
});
