---
name: prisma-patterns
description: Prisma ORM patterns and common pitfalls (N+1, transactions, migrations, connection pooling). Use when user has Prisma performance issues, transaction questions, or asks about schema design and query optimization.
---

# Prisma Patterns Skill

Best practices and common pitfalls for Prisma ORM with PostgreSQL in Node/Fastify applications.

## When to Use
- User mentions "N+1 problem" / "too many queries"
- Connection pool exhaustion errors
- Questions about `include` vs `select`
- Transaction management issues
- Schema/relation design
- Query optimization

---

## Quick Reference: Common Problems

| Problem | Symptom | Solution |
|---------|---------|----------|
| N+1 queries | Many SELECT statements | `include`/`select` with nested relations |
| Connection exhaustion | "too many connections" errors | Tune `connection_limit`, reuse a singleton `PrismaClient` |
| Slow queries | Performance issues | Pagination, `select` projections, indexes |
| Partial writes | Inconsistent state on failure | `$transaction` |
| Lost updates | Concurrent modifications | Optimistic locking via a `version` column |

---

## N+1 Problem

> The #1 ORM performance killer

### The Problem

```typescript
// ❌ BAD: N+1 queries
const authors = await prisma.author.findMany(); // 1 query
for (const author of authors) {
  const books = await prisma.book.findMany({ where: { authorId: author.id } }); // N queries!
}
// Result: 1 + N queries (100 authors = 101 queries)
```

### Solution: `include`

```typescript
// ✅ GOOD: Single query with include
const authors = await prisma.author.findMany({
  include: { books: true },
});
```

### Solution: `select` for narrow projections

```typescript
// ✅ GOOD: Only fetch what's needed
const authors = await prisma.author.findMany({
  select: {
    id: true,
    name: true,
    books: { select: { id: true, title: true } },
  },
});
```

### Detecting N+1

```typescript
// prisma client setup - log queries in development
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query"] : [],
});
```

```bash
# Or via env var
DEBUG="prisma:query" node dist/server.js
```

---

## Connection Management

### Singleton Client (avoid exhausting the pool)

```typescript
// ❌ BAD: new client per request/module
function handler() {
  const prisma = new PrismaClient(); // leaks connections
}

// ✅ GOOD: one client for the process lifetime
// db/client.ts
export const prisma = new PrismaClient();

// register as a Fastify plugin, close on shutdown
fastify.addHook("onClose", async () => {
  await prisma.$disconnect();
});
```

### Pool Sizing

```
# DATABASE_URL connection_limit param
postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
```

Rule of thumb: `connection_limit` per instance × number of instances ≤ Postgres `max_connections`.

---

## Transactions

### Sequential operations (interactive transaction)

```typescript
// ✅ GOOD: atomic multi-step write
async function createOrder(input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: input });
    await tx.inventory.update({
      where: { sku: input.sku },
      data: { qty: { decrement: 1 } },
    });
    return order;
  });
}
```

### Batch operations (sequential transaction array)

```typescript
// ✅ GOOD: independent operations, all-or-nothing
await prisma.$transaction([
  prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
  prisma.auditLog.create({ data: { userId, action: "LOGIN" } }),
]);
```

### Optimistic Locking

```prisma
model Document {
  id      String @id @default(uuid())
  content String
  version Int    @default(0)
}
```

```typescript
// ✅ GOOD: fails if version changed since read
const updated = await prisma.document.updateMany({
  where: { id, version: currentVersion },
  data: { content: newContent, version: { increment: 1 } },
});

if (updated.count === 0) {
  throw new ConflictError("Document was modified concurrently");
}
```

---

## Pagination

```typescript
// ✅ Cursor-based pagination (stable, performant on large tables)
const page = await prisma.message.findMany({
  take: 20,
  skip: cursor ? 1 : 0,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: "desc" },
});

// ❌ Offset pagination degrades on large offsets
const page = await prisma.message.findMany({ skip: 10000, take: 20 });
```

---

## Migrations

```bash
# ✅ Development: create + apply a migration
npx prisma migrate dev --name add_user_email_index

# ✅ CI/production: apply pending migrations only, no schema drift prompts
npx prisma migrate deploy

# ❌ Never use db push in production - it can silently drop data
npx prisma db push
```

**Flags:**
- Editing a migration SQL file after it has been applied elsewhere
- Renaming a column without a migration that preserves data (`@map` + manual SQL)
- Running `migrate dev` against a shared/production database

---

## Quick Reference Flags

| Category | Red Flags |
|----------|-----------|
| **Queries** | Loop calling `findUnique`/`findMany` per iteration |
| **Connections** | `new PrismaClient()` outside a singleton module |
| **Transactions** | Multi-step writes without `$transaction` |
| **Pagination** | Large `skip` values on big tables |
| **Migrations** | `db push` in CI/production, hand-edited applied migrations |
