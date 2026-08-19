---
name: ai-agent-patterns
description: Function-calling / tool-use agent patterns for natural-language fleet queries against structured telemetry data, running on local Ollama (Qwen2.5) with no API key required. Use when user asks about the AI agent, natural language queries, or connecting an LLM to real data instead of a generic chatbot.
---

# AI Agent Patterns Skill

Best practices for building a **minimal, isolated** operational agent that answers natural-language questions about fleet state by calling real functions against the telemetry database — not a general-purpose chatbot, not a RAG-over-documents system.

**This project runs the LLM locally via Ollama (model: `qwen2.5:7b`), not a cloud API.** No API key required — this was a deliberate choice made because no cloud provider credentials were available. Qwen2.5 supports native tool calling, which is what makes this pattern work without a hosted provider.

## Provider Abstraction (Strategy Pattern)

The agent never talks to Ollama or OpenAI directly — it talks to an `LLMProvider` interface (`providers/types.ts`). Each concrete provider (`OllamaProvider`, `OpenAiProvider`) translates the neutral `ChatMessage`/`ToolDefinition` contract into its own API's format internally. `agent.ts` and `tools.ts` are provider-agnostic; a `providers/factory.ts` picks the concrete implementation from `LLM_PROVIDER` env var.

```typescript
// ✅ agent.ts only knows the interface, never a specific provider
const provider = createLLMProvider(); // reads LLM_PROVIDER env var
const response = await provider.chat(messages, toolDefinitions);
```

This is what makes swapping from Qwen (Ollama, free) to OpenAI (paid, once a key is available) a one-line env var change (`LLM_PROVIDER=openai` + `OPENAI_API_KEY=...`), not a rewrite. Adding a third provider (Anthropic, Azure OpenAI via a different `baseURL`) means writing one new class that implements `LLMProvider` — nothing else in the codebase changes.

**Flags:**
- Provider-specific types (Ollama's `tool_calls` shape, OpenAI's `tool_call_id`) leaking into `agent.ts` or `tools.ts` — they must stay inside the provider implementation
- A `switch (providerName)` scattered across multiple files instead of centralized once in `factory.ts`

---

## When to Use
- User asks about "el agente de IA" / "consultas en lenguaje natural" / "function calling"
- Building the service that answers e.g. "¿qué vehículos llevan detenidos más de 20 minutos en zonas críticas?"

## Explicitly Out of Scope for This Project
This is **not** a multi-tenant platform, **not** document-training, **not** an integrations hub. That complexity belongs to a separate product (Botify) and was deliberately excluded here — see the project's AI-audit notes. Keep this service small and single-purpose.

---

## Core Pattern: Tool Use, Not Free-Text SQL Generation

```
User question (natural language)
  → Ollama (Qwen2.5) receives question + tool definitions (NOT raw DB schema/credentials)
    → Model decides which tool(s) to call and with what arguments
      → Backend executes the tool as a parameterized, safe function
        → Tool result returned to the model
          → Model formats a natural-language answer
```

**Never** let the model generate raw SQL directly against production data. Expose typed, parameterized functions instead — this bounds what the model can possibly do wrong.

---

## Tool Definition (OpenAI-compatible format, used by Ollama)

```typescript
// ✅ Narrow, typed, single-purpose tool — not a generic "runQuery" escape hatch
const tools = [
  {
    type: "function",
    function: {
      name: "getStoppedVehicles",
      description: "Returns vehicles that have been stationary for more than the given number of minutes, optionally filtered to a critical zone.",
      parameters: {
        type: "object",
        properties: {
          minMinutesStopped: { type: "number", description: "Minimum minutes stationary" },
          zoneId: { type: "string", description: "Optional critical zone identifier" },
        },
        required: ["minMinutesStopped"],
      },
    },
  },
];

// ✅ Actual implementation — parameterized, bounded, no string interpolation into SQL
async function getStoppedVehicles(args: { minMinutesStopped: number; zoneId?: string }) {
  return prisma.$queryRaw`
    SELECT vehicle_id, last_position, stopped_since
    FROM vehicle_status
    WHERE stopped_since <= NOW() - (${args.minMinutesStopped} || ' minutes')::interval
    ${args.zoneId ? Prisma.sql`AND zone_id = ${args.zoneId}` : Prisma.empty}
  `;
}
```

---

## Agent Loop (Ollama)

```typescript
// ✅ Single-turn tool-use loop against a local Ollama model
import { Ollama } from "ollama";

const ollama = new Ollama({ host: process.env.OLLAMA_URL ?? "http://localhost:11434" });
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

async function answerFleetQuery(question: string): Promise<string> {
  const response = await ollama.chat({
    model: MODEL,
    messages: [{ role: "user", content: question }],
    tools,
  });

  const toolCall = response.message.tool_calls?.[0];
  if (!toolCall) {
    return response.message.content || "No entendí la pregunta.";
  }

  const result = await executeTool(toolCall.function.name, toolCall.function.arguments);

  const followUp = await ollama.chat({
    model: MODEL,
    messages: [
      { role: "user", content: question },
      { role: "assistant", content: response.message.content, tool_calls: response.message.tool_calls },
      { role: "tool", content: JSON.stringify(result) },
    ],
    tools,
  });

  return followUp.message.content || "";
}
```

**Practical notes for Qwen2.5 + Ollama specifically:**
- Not every Ollama model supports tool calling — verify the model card says so before swapping models (`qwen2.5`, `llama3.1`, `mistral-nemo` do; many smaller/older models don't).
- The model must be pulled before first use (`ollama pull qwen2.5:7b`) — in this project, `docker-compose.yml` does this automatically on first boot of the `ollama` service, which makes the first `docker compose up` slower.
- Local inference is slower than a hosted API — budget for that in the circuit breaker's `timeout` (see `circuit-breaker-patterns`), don't reuse a timeout tuned for a cloud provider.
- No API key, no per-token cost, no external network dependency once the model is pulled — this is why it was chosen over a cloud provider for this exercise.

---

## Isolation as a Service Boundary

- Run this as its own small service (or a clearly separated module), called by the main API — this is precisely the boundary where the **circuit breaker** (see `circuit-breaker-patterns` skill) belongs.
- The agent service should have **read-only** database credentials scoped to the telemetry tables it needs — never reuse the ingestion worker's write credentials here.

---

## Quick Reference Flags

| Category | Red Flags |
|----------|-----------|
| **SQL safety** | Model generates raw SQL directly, string-interpolated queries |
| **Scope creep** | Multi-tenant logic, document training, generic chatbot with no tool grounding |
| **Credentials** | Agent service using write-capable or admin DB credentials |
| **Tool design** | One giant `runQuery(sql: string)` tool instead of narrow typed tools |
| **Resilience** | No circuit breaker / timeout between the API and this service; timeout too short for local inference latency |
| **Model choice** | Swapping to an Ollama model that doesn't support tool calling without checking first |

---

## Testing

```typescript
test("getStoppedVehicles only returns vehicles past the threshold", async () => {
  const result = await getStoppedVehicles({ minMinutesStopped: 20 });
  expect(result.every((v) => v.stoppedMinutes >= 20)).toBe(true);
});
```

