---
name: logging-patterns
description: Node/Fastify logging best practices with Pino, structured logging (JSON), and request-id correlation. Includes AI-friendly log formats for Claude Code debugging. Use when user asks about logging, debugging application flow, or analyzing logs.
---

# Logging Patterns Skill

Effective logging for Node/Fastify applications with focus on structured, AI-parsable formats.

## When to Use
- User says "add logging" / "improve logs" / "debug this"
- Analyzing application flow from logs
- Setting up structured logging (JSON)
- Request tracing with correlation IDs
- AI/Claude Code needs to analyze application behavior

---

## AI-Friendly Logging

> **Key insight:** JSON logs are better for AI analysis - faster parsing, fewer tokens, direct field access.

### Why JSON for AI/Claude Code?

```
# Text format - AI must "interpret" the string
2026-01-29 10:15:30 INFO OrderService Order 12345 created for user-789, total: 99.99

# JSON format - AI extracts fields directly
{"time":"2026-01-29T10:15:30.123Z","level":30,"msg":"Order created","orderId":12345,"userId":"user-789","total":99.99}
```

| Aspect | Text | JSON |
|--------|------|------|
| Parsing | Regex/interpretation | Direct field access |
| Token usage | Higher (repeated patterns) | Lower (structured) |
| Error extraction | Parse stack trace text | `err` field |
| Filtering | grep patterns | `jq` queries |

### Fastify's Built-in Logger (Pino)

Fastify ships with Pino as its logger — no extra dependency needed for JSON logs.

```typescript
// server.ts
import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    transport: process.env.NODE_ENV === "development"
      ? { target: "pino-pretty" } // human-readable only in dev
      : undefined,                // raw JSON in prod/CI/AI analysis
  },
});
```

```bash
# Default: JSON (for AI, CI/CD, production)
node dist/server.js

# Human-readable when needed (requires pino-pretty as a dev dependency)
NODE_ENV=development node dist/server.js
```

### Log Format Optimized for AI Analysis

```json
{
  "time": "2026-01-29T10:15:30.123Z",
  "level": 30,
  "reqId": "req-abc123",
  "msg": "Order created",
  "orderId": 12345,
  "userId": "user-789",
  "durationMs": 45,
  "step": "payment_completed"
}
```

**Key fields for AI debugging:**
- `reqId` - group all logs from the same request (Fastify generates this automatically)
- `step` - track progress through a flow
- `durationMs` - identify slow operations
- `level` - quick filter for errors (30=info, 40=warn, 50=error)

### Reading Logs with AI/Claude Code

```bash
# Get recent errors
cat app.log | jq 'select(.level == 50)' | tail -20

# Follow a specific request
cat app.log | jq 'select(.reqId == "req-abc123")'

# Find slow operations
cat app.log | jq 'select(.durationMs > 1000)'
```

AI can then:
1. Parse JSON directly (no guessing)
2. Follow request flow via `reqId`
3. Identify exactly where errors occurred
4. Measure timing between steps

---

## Request Correlation

```typescript
// ✅ Fastify auto-generates req.id; thread it through child loggers
fastify.get("/orders/:id", async (req, reply) => {
  req.log.info({ orderId: req.params.id, step: "lookup_started" }, "fetching order");
  const order = await orderService.findById(req.params.id, req.log);
  req.log.info({ orderId: req.params.id, step: "lookup_completed" }, "order fetched");
  return order;
});

// Propagate the request-scoped logger into services/queue jobs
async function findById(id: string, log: FastifyBaseLogger) {
  log.debug({ step: "db_query" }, "querying database");
  // ...
}
```

For background jobs (BullMQ), generate a correlation id per job and include it on every log line:

```typescript
const worker = new Worker("document-processing", async (job) => {
  const log = baseLogger.child({ jobId: job.id, documentId: job.data.documentId });
  log.info({ step: "started" }, "processing document");
  // ...
  log.info({ step: "completed" }, "document processed");
});
```

---

## Custom Fields

```typescript
// Fields appear as separate JSON keys
req.log.info(
  { orderId: order.id, userId: user.id, total: order.total, step: "order_created" },
  "Order created",
);

// Output:
// {"time":"...","level":30,"reqId":"req-1","orderId":123,"userId":"u-456","total":99.99,"step":"order_created","msg":"Order created"}
```

---

## Pino Basics

### Logger Access

```typescript
// Inside routes/hooks: use the request-scoped logger
fastify.get("/", async (req) => {
  req.log.info("handling request"); // includes reqId automatically
});

// Outside the request lifecycle (startup, workers): use the app/base logger
fastify.log.info("server starting");
```

### Parameterized Logging

```typescript
// ✅ GOOD: structured fields, no string concatenation
log.debug({ orderId, userId }, "processing order");

// ❌ BAD: unstructured, harder to query
log.debug(`Processing order ${orderId} for user ${userId}`);

// ✅ For expensive payloads, guard with level check
if (log.isLevelEnabled("debug")) {
  log.debug({ payload: expensiveSerialize(data) }, "debug payload");
}
```

### Redacting Secrets

```typescript
const fastify = Fastify({
  logger: {
    redact: ["req.headers.authorization", "*.password", "*.token"],
  },
});
```

**Flags:**
- Logging full request/response bodies that may contain secrets or PII
- String-concatenated log messages instead of structured fields
- Missing `reqId`/correlation id in multi-step async flows
- `console.log` used instead of the configured logger (bypasses level filtering, redaction, and JSON structure)
