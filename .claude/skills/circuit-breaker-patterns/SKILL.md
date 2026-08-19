---
name: circuit-breaker-patterns
description: Circuit breaker pattern (opossum) for service-to-service calls - state machine (closed/open/half-open), timeouts, fallbacks. Use when user asks about resiliencia, inter-service calls failing, cascading failures, or confuses this with try/catch.
---

# Circuit Breaker Patterns Skill

Best practices for circuit breakers between the main API and the AI agent service (or any inter-service HTTP call) using `opossum`.

## When to Use
- User asks about "resiliencia" / "circuit breaker" / "fallo en cascada"
- Any HTTP/RPC call from one internal service to another
- **Important distinction:** if the user proposes `try/catch/finally` as "the circuit breaker", clarify the difference before implementing — see below.

---

## Circuit Breaker ≠ try/catch

| | try/catch | Circuit Breaker |
|---|---|---|
| Scope | Single call, no memory | Tracks state **across** calls |
| Behavior on failure | Catches the error, that's it | Opens the circuit after N failures, stops even *trying* further calls |
| Recovery | N/A | Automatically tests recovery after a cooldown (half-open) |
| Protects against | Unhandled exceptions | Cascading failures / thundering herd against a dying downstream service |

A circuit breaker is built **on top of** try/catch, not a replacement for it — the breaker library wraps the call, and you still handle the rejection it throws when open.

---

## State Machine

```
CLOSED (normal) --[failures >= threshold]--> OPEN (fail fast, no calls attempted)
   ^                                              |
   |                                    [after resetTimeout]
   |                                              v
   +----[success]---- HALF-OPEN (allow one trial call) 
                              |
                              +--[failure]--> back to OPEN
```

---

## Implementation

```typescript
// ✅ Wrap the AI agent service call in a circuit breaker
import CircuitBreaker from "opossum";

async function callAiAgent(query: string): Promise<AgentResponse> {
  const response = await fetch(`${AI_AGENT_URL}/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`AI agent responded ${response.status}`);
  return response.json();
}

const breaker = new CircuitBreaker(callAiAgent, {
  timeout: 5000,           // fail if callAiAgent takes longer than this
  errorThresholdPercentage: 50, // open circuit if 50% of requests fail
  resetTimeout: 10000,     // after 10s in OPEN, try again (half-open)
  volumeThreshold: 5,      // minimum calls before the threshold is evaluated
});

// ✅ Fallback when circuit is open — never let the caller hang
breaker.fallback(() => ({
  answer: "El servicio de consultas está temporalmente no disponible. Intenta de nuevo en unos segundos.",
  degraded: true,
}));

breaker.on("open", () => log.warn("AI agent circuit opened — service considered down"));
breaker.on("halfOpen", () => log.info("AI agent circuit half-open — testing recovery"));
breaker.on("close", () => log.info("AI agent circuit closed — service recovered"));

// Usage in a route handler
fastify.post("/chat", async (request, reply) => {
  const result = await breaker.fire(request.body.query);
  return reply.send(result);
});
```

**Flags:**
- Only `try/catch` around an inter-service call with no state tracking across requests — this is NOT a circuit breaker, even if it "handles the error"
- No `fallback()` defined — an open circuit should degrade gracefully, not throw an unhandled rejection to the end user
- `resetTimeout` too short (thundering herd retries) or too long (slow recovery once the dependency is healthy again)
- Wrapping calls that are cheap/local (e.g. in-process function calls) — circuit breakers are for calls that cross a process/network boundary and can fail independently

---

## Where to Apply It in This Project

- **API → AI agent service**: the clearest boundary in the system; wrap it as shown above.
- Optionally: **API → RabbitMQ publish** if the broker connection is unstable, though queue client libraries often have their own reconnect logic — evaluate before double-wrapping.
- Document in the README/AI-audit notes if the agentic tool initially suggested only try/catch here — this is a common "looks right but isn't" mistake worth calling out explicitly.

---

## Testing

```typescript
test("falls back gracefully when AI agent is down", async () => {
  // simulate N consecutive failures to force the circuit open
  for (let i = 0; i < 5; i++) {
    await breaker.fire("test query").catch(() => {});
  }
  const result = await breaker.fire("test query");
  expect(result.degraded).toBe(true);
});
```
