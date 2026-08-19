import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLLMProvider } from "../providers/factory.js";
import { LLM_PROVIDER_NAME } from "../providers/types.js";

/**
 * Cubre la abstracción de proveedor (Strategy pattern) — la razón de ser de
 * esta factory es permitir cambiar de Qwen (gratis) a OpenAI (de pago) con
 * una sola variable de entorno. Estos tests verifican que la selección
 * funciona y que falla con un mensaje claro cuando falta la API key, en vez
 * de fallar silenciosamente o con un error críptico del SDK de OpenAI.
 */
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("createLLMProvider", () => {
  it("usa Ollama por defecto cuando no se define LLM_PROVIDER (positivo)", () => {
    delete process.env.LLM_PROVIDER;
    const provider = createLLMProvider();
    expect(provider.name).toBe(LLM_PROVIDER_NAME.OLLAMA);
  });

  it("selecciona OpenAI cuando LLM_PROVIDER=openai y hay API key (positivo)", () => {
    process.env.LLM_PROVIDER = LLM_PROVIDER_NAME.OPENAI;
    process.env.OPENAI_API_KEY = "sk-test-key";
    const provider = createLLMProvider();
    expect(provider.name).toBe(LLM_PROVIDER_NAME.OPENAI);
  });

  it("lanza un error claro si LLM_PROVIDER=openai pero falta OPENAI_API_KEY (negativo)", () => {
    process.env.LLM_PROVIDER = LLM_PROVIDER_NAME.OPENAI;
    delete process.env.OPENAI_API_KEY;
    expect(() => createLLMProvider()).toThrow(/OPENAI_API_KEY/);
  });

  it("lanza un error para un proveedor desconocido (negativo)", () => {
    process.env.LLM_PROVIDER = "anthropic-legacy";
    expect(() => createLLMProvider()).toThrow(/Proveedor LLM desconocido/);
  });
});
