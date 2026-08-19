import type { LLMProvider } from "./types.js";
import { LLM_PROVIDER_NAME } from "./types.js";
import { OllamaProvider } from "./ollama-provider.js";
import { OpenAiProvider } from "./openai-provider.js";

/**
 * Selección de proveedor por variable de entorno — este es el único punto
 * del código que necesita tocarse para cambiar de modelo. agent.ts y
 * tools.ts no saben (ni les importa) qué proveedor está detrás.
 *
 * LLM_PROVIDER=ollama (default, gratis, local) | openai (de pago, requiere OPENAI_API_KEY)
 */
export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? LLM_PROVIDER_NAME.OLLAMA;

  switch (provider) {
    case LLM_PROVIDER_NAME.OLLAMA:
      return new OllamaProvider(
        process.env.OLLAMA_URL ?? "http://localhost:11434",
        process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
      );

    case LLM_PROVIDER_NAME.OPENAI: {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "LLM_PROVIDER=openai requiere OPENAI_API_KEY en el entorno. " +
          "Ver apps/ai-agent/.env.example.",
        );
      }
      return new OpenAiProvider(apiKey, process.env.OPENAI_MODEL ?? "gpt-4o-mini", process.env.OPENAI_BASE_URL);
    }

    default:
      throw new Error(
        `Proveedor LLM desconocido: "${provider}". Usa "${LLM_PROVIDER_NAME.OLLAMA}" o "${LLM_PROVIDER_NAME.OPENAI}".`,
      );
  }
}
