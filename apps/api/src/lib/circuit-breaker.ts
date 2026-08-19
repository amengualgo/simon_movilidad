import CircuitBreaker from "opossum";

/**
 * Ver skill `circuit-breaker-patterns`.
 * Esto NO es un try/catch: mantiene estado (closed/open/half-open) A TRAVÉS de
 * llamadas, para dejar de intentar contactar al agente de IA si está caído,
 * en vez de que cada request se quede colgado esperando timeouts uno tras otro.
 *
 * Timeout medido, no adivinado: `ai-agent` hace 2 llamadas secuenciales al
 * LLM por consulta (decidir tool + sintetizar respuesta, ver agent.ts). Con
 * Ollama local en CPU (qwen2.5:3b, sin GPU) una sola llamada tardó ~62.5s en
 * esta máquina. 5000ms (el default de la skill `circuit-breaker-patterns`,
 * pensado para una llamada HTTP a un servicio en la nube) abría el breaker
 * en cada consulta real. Ver Caso 11 en tasks/ai-audit-notes.md.
 */
const AI_AGENT_TIMEOUT_MS = 120_000;

async function callAiAgent(query: string): Promise<{ answer: string }> {
  const response = await fetch(`${process.env.AI_AGENT_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(AI_AGENT_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AI agent respondió ${response.status}`);
  return response.json() as Promise<{ answer: string }>;
}

export const aiAgentBreaker = new CircuitBreaker(callAiAgent, {
  timeout: AI_AGENT_TIMEOUT_MS,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  volumeThreshold: 5,
});

aiAgentBreaker.fallback(() => ({
  answer: "El servicio de consultas está temporalmente no disponible. Intenta de nuevo en unos segundos.",
  degraded: true,
}));
