import { Ollama } from "ollama";
import type { LLMProvider, ChatMessage, ChatResult, ToolDefinition } from "./types.js";
import { LLM_PROVIDER_NAME } from "./types.js";

/**
 * Proveedor local, sin API key. Qwen2.5 soporta tool calling nativo.
 * Ver nota de latencia/timeout en la skill `ai-agent-patterns`.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = LLM_PROVIDER_NAME.OLLAMA;
  private client: Ollama;
  private model: string;

  constructor(host: string, model: string) {
    this.client = new Ollama({ host });
    this.model = model;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const response = await this.client.chat({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({ function: { name: tc.name, arguments: tc.arguments } })),
      })),
      tools: tools.map((t) => ({ type: "function" as const, function: t })),
    });

    return {
      content: response.message.content ?? "",
      toolCalls: (response.message.tool_calls ?? []).map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments as Record<string, unknown>,
      })),
    };
  }
}
