---
name: fastify
description: Fastify 5.x backend development - REST APIs, schema validation, Prisma data access, security, and queue-backed background processing. Use for building TypeScript/Node backend services.
metadata:
  version: "1.0.0"
  domain: backend
  triggers: Fastify, Node.js REST API, TypeScript backend, Prisma, BullMQ, Zod validation, Microservices Node
  role: specialist
  scope: implementation
  output-format: code
---

# Fastify Skill

Backend service development with Fastify 5.x, focused on type safety, schema validation, and production readiness.

## Core Workflow

1. **Analyze** - Understand requirements, identify route boundaries, data model, queue needs
2. **Design** - Plan plugin/route structure, confirm design before coding
3. **Implement** - Build with plugin encapsulation and layered architecture
4. **Secure** - Add @fastify/jwt, CORS/helmet, rate-limit; verify tests pass
5. **Test** - Write unit and `fastify.inject()` integration tests; run `npm test` and confirm all pass
6. **Deploy** - Expose a `/health` route; validate it returns 200 before declaring done

## Quick Start Templates

### Schema (zod)
```typescript
import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(1),
  price: z.coerce.number().min(0),
});
export type ProductInput = z.infer<typeof productSchema>;
```

### Route Plugin
```typescript
import type { FastifyPluginAsync } from "fastify";
import { productSchema } from "./product.schema";
import { ProductService } from "./product.service";

export const productRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ProductService(fastify.prisma);

  fastify.get("/", async (req) => {
    const { name = "" } = req.query as { name?: string };
    return service.search(name);
  });

  fastify.post("/", async (req, reply) => {
    const input = productSchema.parse(req.body);
    const product = await service.create(input);
    reply.code(201);
    return product;
  });
};
```

### Service
```typescript
import type { PrismaClient } from "@prisma/client";
import type { ProductInput } from "./product.schema";

export class ProductService {
  constructor(private prisma: PrismaClient) {}

  search(name: string) {
    return this.prisma.product.findMany({
      where: { name: { contains: name, mode: "insensitive" } },
    });
  }

  create(input: ProductInput) {
    return this.prisma.product.create({ data: input });
  }
}
```

### App Registration
```typescript
import Fastify from "fastify";
import { productRoutes } from "./modules/product/product.routes";

export function buildApp() {
  const fastify = Fastify({ logger: true });

  fastify.register(productRoutes, { prefix: "/api/v1/products" });
  fastify.get("/health", async () => ({ status: "ok" }));

  return fastify;
}
```

### Global Error Handler
```typescript
import { ZodError } from "zod";

fastify.setErrorHandler((err, req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: "ValidationError", issues: err.issues });
  }
  if (err.statusCode) {
    return reply.code(err.statusCode).send({ error: err.name, message: err.message });
  }
  req.log.error({ err }, "unhandled error");
  return reply.code(500).send({ error: "InternalServerError" });
});
```

### Test (Vitest + inject)
```typescript
import { describe, it, expect } from "vitest";
import { buildApp } from "../app";

describe("POST /api/v1/products", () => {
  it("creates a product and returns 201", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/products",
      payload: { name: "Widget", price: 10 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe("Widget");
  });
});
```

## Reference Guide

Load detailed patterns based on context:

| Topic | Reference | When to Load |
|-------|-----------|---------------|
| Web/Routing | `references/web.md` | Routes, plugins, error handling, versioning |
| Data Access | `references/data.md` | Prisma, transactions, pagination |
| Security | `references/security.md` | JWT auth, CORS, rate-limit, secrets |
| Testing | `references/testing.md` | Unit, `inject()` integration, mocking |

## Constraints

### MUST DO
- Plugin encapsulation per module (no global mutable state)
- `zod` validation on every route input (body/query/params)
- `$transaction` for multi-step writes
- Type-safe config via a validated env schema (zod) at startup
- Centralized error handling via `setErrorHandler`
- Externalize secrets (env vars, never committed config files)
- A `/health` route on every service

### MUST NOT DO
- Skip input validation on any route
- Mix sync and async I/O on the hot path (blocks the event loop)
- Store secrets in committed config files
- Instantiate `PrismaClient` outside the shared singleton
- Use deprecated Fastify 3.x/4.x callback-style hooks in new code
- Hardcode URLs, credentials, or environment values

## Architecture Patterns

**Project Structure:**
```
apps/api/src/
├── modules/
│   └── <feature>/
│       ├── <feature>.routes.ts
│       ├── <feature>.service.ts
│       ├── <feature>.schema.ts
│       └── <feature>.test.ts
├── plugins/        # cross-cutting Fastify plugins (auth, prisma, queues)
├── lib/            # shared utilities
├── config/         # env validation/config loading
└── app.ts          # buildApp() composition root
```

**Layering:**
- Route → Service → Prisma
- Route handles HTTP, schema validation
- Service handles business logic, transactions
- Prisma handles data persistence

**Clean Architecture Principles:**
- Domain logic independent of Fastify-specific types where practical
- Dependency inversion via constructor injection into services
- Clear module boundaries — one module per business capability

## Common Fastify Decorators/Plugins

| Plugin/Decorator | Purpose |
|-------------------|---------|
| `@fastify/jwt` | Stateless authentication |
| `@fastify/cors` | Cross-origin request control |
| `@fastify/helmet` | Security headers |
| `@fastify/rate-limit` | Per-route/IP rate limiting |
| `@fastify/multipart` | File upload handling |
| `@fastify/swagger` | OpenAPI schema generation |
| `fastify.decorate()` | Attach shared instances (e.g. `prisma`, `queues`) to the instance |
| `preHandler` hook | Per-route auth/validation logic |

## Background Job Producer

```typescript
import type { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";

export const queuesPlugin: FastifyPluginAsync = async (fastify) => {
  const documentQueue = new Queue("document-processing", { connection: fastify.redis });
  fastify.decorate("documentQueue", documentQueue);

  fastify.addHook("onClose", async () => {
    await documentQueue.close();
  });
};
```

## JWT Auth

```typescript
import fastifyJwt from "@fastify/jwt";

fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET! });

fastify.addHook("preHandler", async (req, reply) => {
  if (req.routeOptions.url === "/health") return;
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
});
```

## Knowledge Base

Fastify 5, Node.js 20+, TypeScript, Zod, Prisma ORM, PostgreSQL, BullMQ, ioredis, @fastify/jwt, @fastify/cors, @fastify/helmet, @fastify/rate-limit, @fastify/multipart, @fastify/swagger, bcryptjs, Vitest, Pino
