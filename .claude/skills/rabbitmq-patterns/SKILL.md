---
name: rabbitmq-patterns
description: RabbitMQ work-queue patterns for async telemetry ingestion - publisher confirms, manual ack/nack, dead-letter exchanges, idempotent consumers, prefetch tuning. Use when user asks about async ingestion, background validation, queue reliability, or duplicate/poison messages.
---

# RabbitMQ Patterns Skill

Best practices for RabbitMQ-backed async ingestion in Node/TypeScript services (amqplib).

## When to Use
- User asks about "ingesta asíncrona" / "cola de mensajes" / "background validation"
- Duplicate telemetry events, poison messages, or lost events
- Designing the API → queue → worker → persistence pipeline
- Producer/consumer boundary design between the ingestion API and the validation worker

---

## Core Flow for This Project

```
Vehicle POST /telemetry
  → API validates ONLY shape (is it JSON?), NOT business rules
  → API publishes raw event to "telemetry.raw" queue
  → API responds 202 Accepted immediately (does not wait for validation)
    → Worker consumes from "telemetry.raw"
      → Worker runs full validation (schema, ranges, vehicle exists)
      → Valid → persist to Postgres, emit WebSocket update
      → Invalid → route to "telemetry.dead-letter" for inspection, do NOT retry forever
```

The API never blocks on validation or persistence — that's the entire point of the async ingestion pipeline.

---

## Quick Reference: Common Problems

| Problem | Symptom | Solution |
|---------|---------|----------|
| Duplicate telemetry rows | Same GPS ping persisted twice | Idempotency key (`vehicleId + timestamp` or client-generated eventId) via `ON CONFLICT DO NOTHING` / upsert |
| Poison messages | Malformed payload requeues forever | Dead-letter exchange after max retry count |
| Consumer overload | One slow consumer blocks the queue | Tune `prefetch` (QoS), scale consumers horizontally |
| Lost events on crash | Worker dies mid-processing | Manual ack only after successful persistence, never auto-ack |
| Publisher doesn't know if broker received it | Silent message loss | Publisher confirms (`confirmSelect`) |

---

## Connection & Channel Setup

```typescript
// ✅ One connection per process, one channel per logical unit of work
import amqp, { type ChannelModel, type Channel } from "amqplib";

let connection: ChannelModel;
let channel: Channel;

async function connectRabbitMQ() {
  connection = await amqp.connect(process.env.RABBITMQ_URL!);
  channel = await connection.createChannel();
  await channel.assertExchange("telemetry", "direct", { durable: true });
  await channel.assertQueue("telemetry.raw", { durable: true });
  await channel.assertQueue("telemetry.dead-letter", { durable: true });
  await channel.bindQueue("telemetry.raw", "telemetry", "raw");
  await channel.prefetch(20); // limit unacked messages per consumer
}
```

---

## Publisher (API side) — fire-and-forget, but confirmed

```typescript
// ✅ Publisher confirms: know the broker actually received it
async function publishTelemetryEvent(event: RawTelemetryEvent) {
  await channel.confirmSelect(); // once per channel, not per publish
  channel.publish(
    "telemetry",
    "raw",
    Buffer.from(JSON.stringify(event)),
    { persistent: true, messageId: event.eventId },
  );
}
```

```typescript
// ✅ Fastify route: never await validation/persistence here
fastify.post("/telemetry", async (request, reply) => {
  const raw = request.body; // only structural parsing (is it valid JSON shape?)
  await publishTelemetryEvent(raw);
  return reply.code(202).send({ accepted: true });
});
```

---

## Consumer (worker side) — manual ack, idempotent persistence

```typescript
// ✅ Never auto-ack. Ack only after successful, idempotent persistence.
channel.consume("telemetry.raw", async (msg) => {
  if (!msg) return;

  try {
    const event = JSON.parse(msg.content.toString());
    const parsed = telemetrySchema.safeParse(event); // full business validation here

    if (!parsed.success) {
      channel.nack(msg, false, false); // don't requeue → routes to DLX
      return;
    }

    // Idempotent write: same eventId twice must not create duplicates
    await prisma.telemetryEvent.upsert({
      where: { eventId: parsed.data.eventId },
      create: parsed.data,
      update: {},
    });

    broadcastToWebSocketClients(parsed.data); // live dashboard update
    channel.ack(msg);
  } catch (err) {
    channel.nack(msg, false, true); // transient error → requeue once
  }
});
```

**Flags:**
- `noAck: true` on the consumer (auto-ack before processing completes)
- `create()` instead of `upsert()`/`ON CONFLICT` in the persistence step
- No dead-letter exchange configured → poison messages loop forever
- Unbounded requeue on `nack` without a retry-count cap

---

## Dead-Letter Exchange Setup

```typescript
// ✅ Queue with DLX configured — after N failed processing attempts, message routes here automatically
await channel.assertQueue("telemetry.raw", {
  durable: true,
  arguments: {
    "x-dead-letter-exchange": "telemetry.dlx",
    "x-dead-letter-routing-key": "dead-letter",
  },
});
await channel.assertExchange("telemetry.dlx", "direct", { durable: true });
await channel.assertQueue("telemetry.dead-letter", { durable: true });
await channel.bindQueue("telemetry.dead-letter", "telemetry.dlx", "dead-letter");
```

Dead-lettered messages should be inspectable (log + optional alert), never silently dropped.

---

## Testing Consumer Logic

```typescript
// ✅ Test the handler function directly, decoupled from amqplib
async function processTelemetryEvent(raw: unknown) { /* validation + persist */ }

test("processTelemetryEvent is idempotent", async () => {
  const event = { eventId: "evt-1", vehicleId: "v-1", lat: 4.6, lng: -74.1, ts: new Date().toISOString() };
  await processTelemetryEvent(event);
  await processTelemetryEvent(event); // simulate redelivery
  const count = await prisma.telemetryEvent.count({ where: { eventId: "evt-1" } });
  expect(count).toBe(1);
});
```

---

## Quick Reference Flags

| Category | Red Flags |
|----------|-----------|
| **Acking** | `noAck: true`, acking before persistence succeeds |
| **Idempotency** | `create()` instead of upsert on consumer writes |
| **Dead-lettering** | No DLX configured, infinite requeue loop on bad payloads |
| **Backpressure** | No `prefetch` set (unbounded in-flight messages per consumer) |
| **Publisher reliability** | No `confirmSelect()`, fire-and-forget with no delivery guarantee |
