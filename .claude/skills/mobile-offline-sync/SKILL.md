---
name: mobile-offline-sync
description: Offline-first sync patterns for the React Native driver app - local persistence (SQLite/WatermelonDB), idempotent batch sync, conflict-free ordering. Use when user asks about offline mode, lost connectivity, or syncing queued coordinates.
---

# Mobile Offline Sync Skill

Best practices for the React Native driver app: it must keep capturing GPS coordinates without network, and sync in bulk on reconnect, without creating duplicates or losing events.

## When to Use
- User asks about "offline-first" / "sin conexión" / "sincronización en bloque"
- App loses network mid-route and needs to reconcile on reconnect

---

## Core Flow

```
GPS coordinate captured
  → Write to local store immediately (SQLite/WatermelonDB), status = "pending"
    → Network available?
        No  → keep capturing locally, no blocking, no data loss
        Yes → sync worker picks up all "pending" rows
                → sends as ONE batch request (not one request per point)
                  → server upserts by client-generated eventId (idempotent)
                    → on success, mark local rows status = "synced"
                    → on partial failure, only the failed rows stay "pending"
```

---

## Local Schema

```typescript
// ✅ Each row has a client-generated, globally unique id — this is what makes retries safe
interface LocalTelemetryEvent {
  eventId: string;       // uuid, generated on-device at capture time — NEVER server-assigned
  vehicleId: string;
  lat: number;
  lng: number;
  capturedAt: string;    // ISO timestamp, device clock
  status: "pending" | "syncing" | "synced";
}
```

The `eventId` being generated on-device (not by the server) is the single most important idempotency decision in this flow — it's what lets a retried batch be deduplicated safely on the backend via upsert, exactly as in `rabbitmq-patterns`.

---

## Capture (always local-first)

```typescript
// ✅ Never attempt a network call from the capture path
async function captureLocation(coords: GeolocationCoordinates, vehicleId: string) {
  await db.write(async () => {
    await telemetryCollection.create((event) => {
      event.eventId = uuid();
      event.vehicleId = vehicleId;
      event.lat = coords.latitude;
      event.lng = coords.longitude;
      event.capturedAt = new Date().toISOString();
      event.status = "pending";
    });
  });
}
```

---

## Batch Sync on Reconnect

```typescript
// ✅ Triggered by NetInfo connectivity listener, not polling
NetInfo.addEventListener((state) => {
  if (state.isConnected) syncPendingEvents();
});

async function syncPendingEvents() {
  const pending = await telemetryCollection.query(Q.where("status", "pending")).fetch();
  if (pending.length === 0) return;

  const batch = pending.map((e) => ({
    eventId: e.eventId,
    vehicleId: e.vehicleId,
    lat: e.lat,
    lng: e.lng,
    capturedAt: e.capturedAt,
  }));

  try {
    const response = await fetch(`${API_URL}/telemetry/batch`, {
      method: "POST",
      body: JSON.stringify({ events: batch }),
    });

    if (response.ok) {
      await db.write(async () => {
        for (const e of pending) await e.update((row) => { row.status = "synced"; });
      });
    }
    // non-ok response: leave rows as "pending", will retry on next connectivity event
  } catch {
    // network dropped mid-sync — rows remain "pending", safe to retry entirely
  }
}
```

**Flags:**
- Server-generated IDs for offline-captured events — makes deduplication on retry impossible
- One HTTP request per coordinate instead of a single batch (drains battery, floods the API)
- Marking rows "synced" before confirming the server response
- Polling for connectivity instead of using the platform's connectivity listener (`NetInfo`)

---

## Backend Side (batch endpoint, idempotent)

```typescript
// ✅ Same idempotency principle as the RabbitMQ consumer — upsert by client eventId
fastify.post("/telemetry/batch", async (request, reply) => {
  const { events } = request.body as { events: RawTelemetryEvent[] };
  for (const event of events) {
    await publishTelemetryEvent(event); // reuses the same async ingestion pipeline
  }
  return reply.code(202).send({ accepted: events.length });
});
```

The mobile batch endpoint feeds into the **same** RabbitMQ ingestion pipeline described in `rabbitmq-patterns` — there is only one ingestion path in this system, whether the source is a single live event or a replayed offline batch.

---

## Testing

```typescript
test("re-syncing the same batch does not create duplicates", async () => {
  const batch = [{ eventId: "evt-offline-1", vehicleId: "v-1", lat: 4.6, lng: -74.1, capturedAt: new Date().toISOString() }];
  await syncBatch(batch);
  await syncBatch(batch); // simulate retry after a dropped response
  const count = await prisma.telemetryEvent.count({ where: { eventId: "evt-offline-1" } });
  expect(count).toBe(1);
});
```
