---
name: websocket-patterns
description: WebSocket patterns for the live fleet dashboard (@fastify/websocket) - broadcast on persistence, reconnection, backpressure, auth. Use when user asks about live map updates, real-time dashboard, or SSE vs WebSockets.
---

# WebSocket Patterns Skill

Best practices for pushing live telemetry updates to the React dashboard via `@fastify/websocket`.

## When to Use
- User asks about "mapa en vivo" / "dashboard reactivo" / "tiempo real"
- Deciding between WebSockets and Server-Sent Events (SSE)

---

## WebSockets vs SSE — quick decision

| | WebSockets | SSE |
|---|---|---|
| Direction | Bidirectional | Server → client only |
| Fits this project? | Yes — dashboard also sends chat messages to the AI agent over the same channel is *optional*, but bidirectional is the safer default | Only if the dashboard never needs to send anything back |
| Reconnection | Manual (or library) | Built into the browser `EventSource` API |

For this project: **WebSockets**, since the dashboard both receives live position updates and sends chat queries to the AI agent.

---

## Server Side

```typescript
// ✅ Fastify plugin: broadcast to all connected dashboard clients
import websocketPlugin from "@fastify/websocket";

const clients = new Set<WebSocket>();

fastify.register(websocketPlugin);
fastify.register(async (app) => {
  app.get("/ws/fleet", { websocket: true }, (connection) => {
    clients.add(connection.socket);
    connection.socket.on("close", () => clients.delete(connection.socket));
  });
});

// ✅ Called from the RabbitMQ consumer after successful persistence — NOT from the API route
function broadcastToWebSocketClients(event: TelemetryEvent) {
  const payload = JSON.stringify({ type: "telemetry:update", data: event });
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
```

**Key point:** the broadcast happens in the **worker**, after the event is validated and persisted — never in the ingestion API route, which only publishes to the queue and returns `202`.

---

## Client Side (React)

```typescript
// ✅ Reconnecting WebSocket hook with exponential backoff
function useFleetSocket(onUpdate: (event: TelemetryEvent) => void) {
  useEffect(() => {
    let socket: WebSocket;
    let retryDelay = 1000;

    function connect() {
      socket = new WebSocket(`${WS_URL}/ws/fleet`);
      socket.onmessage = (msg) => {
        const parsed = JSON.parse(msg.data);
        if (parsed.type === "telemetry:update") onUpdate(parsed.data);
      };
      socket.onclose = () => {
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000); // cap backoff
      };
      socket.onopen = () => { retryDelay = 1000; };
    }

    connect();
    return () => socket?.close();
  }, [onUpdate]);
}
```

**Flags:**
- No reconnection logic on the client — a dropped connection silently freezes the live map
- Broadcasting raw DB rows without a stable `type` field on the message — the frontend can't safely discriminate message kinds as more event types get added
- Sending large historical payloads over the socket instead of using it purely for incremental updates (fetch initial state via REST, then subscribe for deltas)

---

## Backpressure / Fan-out at Scale

- `clients.add/delete` on close is fine at the scale of this exercise (single dashboard instance). If scaling beyond one Node process, broadcasting requires a shared pub/sub layer (Redis pub/sub) so all instances relay the same event — document this as a known scaling boundary in the README rather than building it for the exercise.

---

## Testing

```typescript
test("broadcasts only to open sockets", () => {
  const openSocket = { readyState: 1, send: vi.fn() };
  const closedSocket = { readyState: 3, send: vi.fn() };
  clients.add(openSocket as any);
  clients.add(closedSocket as any);

  broadcastToWebSocketClients(mockEvent);

  expect(openSocket.send).toHaveBeenCalled();
  expect(closedSocket.send).not.toHaveBeenCalled();
});
```
