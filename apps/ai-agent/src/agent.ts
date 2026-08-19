import { createLLMProvider } from "./providers/factory.js";
import { toolDefinitions, executeTool } from "./tools.js";
import { MESSAGE_ROLE, type ChatMessage } from "./providers/types.js";

const provider = createLLMProvider();

/**
 * Bucle de agente de un solo turno de tool-use. Esta función NO sabe ni le
 * importa si detrás hay Ollama/Qwen o OpenAI — habla exclusivamente contra
 * la interfaz LLMProvider (ver providers/types.ts). Cambiar de proveedor es
 * una variable de entorno (LLM_PROVIDER), no un cambio de código aquí.
 *
 * Deliberadamente simple: sin memoria de sesión, sin multi-tenant, sin
 * integraciones externas — ese alcance mayor (plataforma Botify) fue
 * evaluado y descartado explícitamente para este ejercicio. Ver
 * tasks/ai-audit-notes.md y CLAUDE.md.
 *
 * Se distingue explícitamente en qué ETAPA falla (llamada al modelo vs.
 * ejecución de la tool) para que el log sea útil al diagnosticar — un
 * catch genérico envolviendo todo el cuerpo perdería esa información.
 */
export async function answerFleetQuery(question: string): Promise<string> {
  const messages: ChatMessage[] = [{ role: MESSAGE_ROLE.USER, content: question }];

  let response;
  try {
    response = await provider.chat(messages, toolDefinitions);
  } catch (err) {
    throw new Error(`LLM provider "${provider.name}" call failed: ${(err as Error).message}`, { cause: err });
  }

  if (response.toolCalls.length === 0) {
    return response.content || "No entendí la pregunta.";
  }

  const toolCall = response.toolCalls[0];

  let result: unknown;
  try {
    result = await executeTool(toolCall.name, toolCall.arguments);
  } catch (err) {
    throw new Error(`Tool execution failed for "${toolCall.name}": ${(err as Error).message}`, { cause: err });
  }

  messages.push({ role: MESSAGE_ROLE.ASSISTANT, content: response.content, toolCalls: response.toolCalls });
  messages.push({ role: MESSAGE_ROLE.TOOL, content: JSON.stringify(result), toolCallId: toolCall.id });

  try {
    const followUp = await provider.chat(messages, toolDefinitions);
    return followUp.content;
  } catch (err) {
    throw new Error(`LLM provider "${provider.name}" follow-up call failed: ${(err as Error).message}`, {
      cause: err,
    });
  }
}
