import OpenAI from "openai";
import type { LLMProvider, ChatMessage, ChatResult, ToolDefinition } from "./types.js";
import { LLM_PROVIDER_NAME, MESSAGE_ROLE } from "./types.js";

/**
 * Proveedor de pago. Requiere OPENAI_API_KEY. Compatible también con
 * cualquier endpoint que implemente la Chat Completions API de OpenAI
 * (Azure OpenAI, OpenRouter, etc.) vía OPENAI_BASE_URL si hiciera falta.
 */
export class OpenAiProvider implements LLMProvider {
  readonly name = LLM_PROVIDER_NAME.OPENAI;
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === MESSAGE_ROLE.TOOL) {
          return { role: MESSAGE_ROLE.TOOL, content: m.content, tool_call_id: m.toolCallId! };
        }
        if (m.role === MESSAGE_ROLE.ASSISTANT && m.toolCalls?.length) {
          return {
            role: MESSAGE_ROLE.ASSISTANT,
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id!,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          };
        }
        return { role: m.role as typeof MESSAGE_ROLE.USER | typeof MESSAGE_ROLE.ASSISTANT, content: m.content };
      }),
      tools: tools.map((t) => ({ type: "function" as const, function: t })),
    });

    const choice = response.choices[0].message;
    return {
      content: choice.content ?? "",
      toolCalls: (choice.tool_calls ?? []).flatMap((tc) => {
        try {
          return [{ id: tc.id, name: tc.function.name, arguments: JSON.parse(tc.function.arguments) }];
        } catch {
          // El modelo puede devolver JSON malformado en los argumentos de
          // una tool call (raro, pero ocurre con modelos más pequeños/quantizados).
          // Descartamos SOLO esa tool call en vez de tumbar toda la respuesta
          // — el resto del contenido de texto del modelo sigue siendo válido.
          return [];
        }
      }),
    };
  }
}
