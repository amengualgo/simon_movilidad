/**
 * Contrato común que cualquier proveedor de LLM debe cumplir para poder
 * usarse en el agente. Ver skill `ai-agent-patterns` — esto es lo que
 * permite cambiar de Qwen (Ollama, gratis) a OpenAI/Anthropic (de pago)
 * cambiando una variable de entorno, sin tocar agent.ts ni tools.ts.
 *
 * LLM_PROVIDER_NAME y MESSAGE_ROLE están centralizados aquí como constantes
 * "as const" (equivalente idiomático a un enum en TS) porque antes eran
 * strings literales repetidos sueltos en factory.ts, ollama-provider.ts,
 * openai-provider.ts y agent.ts.
 */

export const LLM_PROVIDER_NAME = {
  OLLAMA: "ollama",
  OPENAI: "openai",
} as const;

export type LLMProviderName = (typeof LLM_PROVIDER_NAME)[keyof typeof LLM_PROVIDER_NAME];

export const MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  TOOL: "tool",
} as const;

export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface ToolCall {
  id?: string; // algunos proveedores (Anthropic/OpenAI) requieren id para el tool_result; Ollama no.
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string; // usado en mensajes role: MESSAGE_ROLE.TOOL para correlacionar con la llamada original
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

/**
 * Cada proveedor traduce este contrato neutral a su propio formato de API
 * (Ollama, OpenAI Chat Completions, Anthropic Messages, etc.) internamente.
 */
export interface LLMProvider {
  readonly name: LLMProviderName;
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatResult>;
}
