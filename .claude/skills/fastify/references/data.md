# Fastify Data Access Reference

See `prisma-patterns` skill for ORM-level pitfalls (N+1, transactions, migrations). This reference covers wiring Prisma into Fastify specifically.

## Prisma as a Fastify Plugin

```typescript
// plugins/prisma.ts
import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

export const prismaPlugin = fp(async (fastify) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });
});
```

```typescript
// app.ts
fastify.register(prismaPlugin);

// usage in routes - fastify.prisma is now typed via decoration
fastify.get("/products", async () => fastify.prisma.product.findMany());
```

```typescript
// types/fastify.d.ts - module augmentation for fastify.prisma typing
import type { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
```

## Repository-Style Services

Keep Prisma calls inside service classes, not directly in route handlers, so routes stay focused on HTTP concerns and services stay testable without spinning up Fastify.

```typescript
export class OrderService {
  constructor(private prisma: PrismaClient) {}

  async createOrder(input: OrderInput) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: input });
      await tx.inventory.update({
        where: { sku: input.sku },
        data: { qty: { decrement: 1 } },
      });
      return order;
    });
  }
}
```

## Multi-Tenant Data Scoping

When a schema includes a tenant/organization column, scope every query explicitly rather than relying on convention — a missing `where` clause is a data leak across tenants.

```typescript
// ✅ Tenant id always passed explicitly and applied first
async findOrders(tenantId: string, filters: OrderFilters) {
  return this.prisma.order.findMany({
    where: { tenantId, ...filters },
  });
}

// ❌ Easy to forget - relies on the caller remembering to scope
async findOrders(filters: OrderFilters) {
  return this.prisma.order.findMany({ where: filters });
}
```

Consider a Prisma Client Extension (`$extends`) to enforce tenant scoping at the client level for high-risk models, so a missing `where` fails loudly instead of leaking data.

## Seeding & Test Data

```typescript
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.product.createMany({
    data: [{ name: "Widget", price: 9.99 }],
    skipDuplicates: true,
  });
}

main().finally(() => prisma.$disconnect());
```

```json
// package.json
{ "prisma": { "seed": "tsx prisma/seed.ts" } }
```

## Health Check Query

```typescript
fastify.get("/health", async () => {
  await fastify.prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});
```
