# Fastify Testing Reference

## Unit Testing Services (Vitest)

Test business logic directly, without spinning up Fastify, by injecting a mocked Prisma client.

```typescript
import { describe, it, expect, vi } from "vitest";
import { ProductService } from "./product.service";

describe("ProductService", () => {
  it("creates a product", async () => {
    const prisma = { product: { create: vi.fn().mockResolvedValue({ id: "1", name: "Widget" }) } };
    const service = new ProductService(prisma as any);

    const result = await service.create({ name: "Widget", price: 10 });

    expect(result.name).toBe("Widget");
    expect(prisma.product.create).toHaveBeenCalledWith({ data: { name: "Widget", price: 10 } });
  });
});
```

## Integration Testing Routes (`fastify.inject()`)

`inject()` exercises the full plugin/route pipeline (validation, hooks, error handling) without binding to a real port.

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app";
import type { FastifyInstance } from "fastify";

describe("Product routes", () => {
  let app: FastifyInstance;

  beforeEach(() => { app = buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 on invalid payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      payload: { name: "", price: -1 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 201 on valid payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      payload: { name: "Widget", price: 9.99 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Widget" });
  });
});
```

## Test Database Isolation

```typescript
// vitest.setup.ts - reset state between test files
import { execSync } from "node:child_process";
import { beforeAll } from "vitest";

beforeAll(() => {
  execSync("npx prisma migrate reset --force --skip-seed", { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL } });
});
```

Run integration tests against a dedicated `TEST_DATABASE_URL` (e.g. a separate Postgres database/container), never against development or production data.

## Mocking BullMQ in Route Tests

```typescript
import { vi } from "vitest";

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
}));
```

Test the job handler function itself separately (see `queue-patterns` skill) rather than asserting on internal BullMQ behavior.

## Mocking External HTTP Calls

```typescript
import { vi } from "vitest";

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ id: "ext-123" }),
});
```

## Contract Testing Webhooks

Keep a fixture of real (anonymized) third-party webhook payloads and assert the adapter normalizes them correctly — this catches breaking changes from the external provider's API early.

```typescript
import payloadFixture from "./fixtures/webhook-event.json";

it("normalizes the provider payload", () => {
  const normalized = normalizeWebhookEvent(payloadFixture);
  expect(normalized).toMatchObject({ channel: expect.any(String), externalId: expect.any(String) });
});
```

## Coverage Targets

| Layer | Target | Tool |
|-------|--------|------|
| Services | > 85% | Vitest unit tests |
| Routes | All status code branches | `fastify.inject()` |
| Queue handlers | Idempotency + failure paths | Vitest unit tests on the handler function |
| Webhook adapters | Signature verify + payload normalization | Fixture-based contract tests |
