# Fastify Web/Routing Reference

## Plugin Encapsulation

Fastify plugins create an encapsulation context — decorators and hooks registered inside a plugin don't leak to sibling plugins unless explicitly shared via `fastify-plugin`.

```typescript
import fp from "fastify-plugin";

// ✅ Use fastify-plugin when decorators must be visible to the parent scope
export const prismaPlugin = fp(async (fastify) => {
  fastify.decorate("prisma", new PrismaClient());
});

// ✅ Plain plugin (default) when encapsulation is desired - e.g. route modules
export const productRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", async () => { /* ... */ });
};
```

## Route Versioning

```typescript
fastify.register(productRoutesV1, { prefix: "/api/v1/products" });
fastify.register(productRoutesV2, { prefix: "/api/v2/products" });
```

Prefer additive versioning (new route prefix) over breaking changes to an existing version. Deprecate old versions with a `Deprecation` response header before removal.

## Validation with Zod

Fastify's native schema validation uses JSON Schema by default. For a TypeScript-first project, validate manually with zod inside the handler (shown in SKILL.md), or use `fastify-type-provider-zod` to wire zod schemas directly into Fastify's schema/serialization pipeline:

```typescript
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

fastify.post("/", {
  schema: {
    body: zodToJsonSchema(productSchema),
  },
}, async (req) => { /* req.body is validated against the JSON schema */ });
```

For most apps, parsing with `schema.parse(req.body)` inside the handler (and letting `setErrorHandler` catch `ZodError`) is simpler to reason about and keeps validation logic in one place.

## Error Handling

```typescript
// Custom error classes carry a statusCode the global handler can read
export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) { super(message); this.name = "NotFoundError"; }
}

export class ConflictError extends Error {
  statusCode = 409;
  constructor(message: string) { super(message); this.name = "ConflictError"; }
}

// Usage in a service
if (!product) throw new NotFoundError(`Product ${id} not found`);
```

```typescript
// Global handler (see SKILL.md) reads err.statusCode and responds consistently
fastify.setErrorHandler((err, req, reply) => {
  const statusCode = (err as any).statusCode ?? 500;
  reply.code(statusCode).send({ error: err.name, message: err.message });
});
```

## Request Lifecycle Hooks

| Hook | Use For |
|------|---------|
| `onRequest` | Auth pre-checks before body parsing |
| `preParsing` | Stream transformation (rare) |
| `preValidation` | Mutate request before schema validation |
| `preHandler` | Auth/authorization, request-scoped setup |
| `onSend` | Response shaping (e.g. envelope wrapping) |
| `onResponse` | Metrics/logging after response is sent |
| `onError` | Side-effects on error (alerting), not error transformation |

## Content Negotiation & Pagination Conventions

```typescript
// ✅ Consistent paginated response shape
interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

fastify.get("/", async (req) => {
  const { page = 1, pageSize = 20 } = req.query as { page?: number; pageSize?: number };
  const [data, total] = await Promise.all([
    service.findPage(page, pageSize),
    service.count(),
  ]);
  return { data, page, pageSize, total } satisfies PaginatedResponse<Product>;
});
```

## OpenAPI Documentation

```typescript
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

await fastify.register(swagger, {
  openapi: { info: { title: "API", version: "1.0.0" } },
});
await fastify.register(swaggerUi, { routePrefix: "/docs" });
```
