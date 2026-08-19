---
name: code-quality
description: Comprehensive code review for TypeScript/Node - clean code principles, API contracts, type safety, error handling, and performance. Use when user says "review code", "refactor", "check API", or before merging changes.
---

# Code Quality Review Skill

Systematic code review combining clean code principles, API design, and TypeScript/Node best practices.

## When to Use
- "review this code" / "code review" / "check this PR"
- "refactor" / "clean this code" / "improve readability"
- "review API" / "check endpoints" / "REST review"
- Before merging PR or releasing API changes

## Review Strategy

1. **Quick scan** - Understand intent, identify scope
2. **Checklist pass** - Apply relevant categories below
3. **Summary** - List findings by severity (Critical → Minor → Good)

---

## Clean Code Principles

### DRY - Don't Repeat Yourself

**Violation:**
```typescript
// ❌ Duplicated validation logic
function createUser(req: UserRequest) {
  if (!req.email || !req.email.includes("@")) {
    throw new ValidationError("Invalid email");
  }
}

function updateUser(req: UserRequest) {
  if (!req.email || !req.email.includes("@")) {
    throw new ValidationError("Invalid email");
  }
}
```

**Fix:**
```typescript
// ✅ Single source of truth (zod schema)
const emailSchema = z.string().email();

function validateEmail(email: string) {
  return emailSchema.parse(email);
}
```

### KISS - Keep It Simple

**Violation:**
```typescript
// ❌ Over-engineered
interface UserFactory {
  createUser(): User;
}
class ConcreteUserFactory implements UserFactory {
  createUser(): User { return new User(); }
}
```

**Fix:**
```typescript
// ✅ Simple
function createUser(): User { return new User(); }
```

### YAGNI - You Aren't Gonna Need It

**Violation:**
```typescript
// ❌ Premature abstraction
class ConfigurableUserServiceFactoryProvider {}
```

**Fix:**
```typescript
// ✅ Implement when actually needed
class UserService {}
```

---

## API Contract Review

### HTTP Verb Semantics

| Verb | Use For | Idempotent | Safe |
|------|---------|------------|------|
| GET | Retrieve resource | Yes | Yes |
| POST | Create new resource | No | No |
| PUT | Replace entire resource | Yes | No |
| PATCH | Partial update | No* | No |
| DELETE | Remove resource | Yes | No |

**Common Mistakes:**
```typescript
// ❌ POST for retrieval
fastify.post("/users/search", async (req) => { /* ... */ });

// ✅ GET with query params
fastify.get("/users", async (req) => { /* ... */ });

// ❌ GET for state change
fastify.get("/users/:id/activate", async (req) => { /* ... */ });

// ✅ POST/PATCH for state change
fastify.post("/users/:id/activate", async (req, reply) => {
  reply.code(204);
});
```

### API Versioning

```typescript
// ✅ URL path versioning (recommended)
fastify.register(userRoutes, { prefix: "/api/v1/users" });

// ❌ No versioning
fastify.register(userRoutes, { prefix: "/users" }); // Breaking changes affect all clients
```

### Response Status Codes

| Code | Use Case | Example |
|------|----------|---------|
| 200 OK | Successful GET/PUT/PATCH | Found resource |
| 201 Created | Successful POST | New resource created |
| 204 No Content | Successful DELETE | Resource deleted |
| 400 Bad Request | Validation failure | Invalid input |
| 404 Not Found | Resource doesn't exist | User not found |
| 409 Conflict | State conflict | Duplicate email |
| 500 Server Error | Unexpected error | Database down |

### DTO vs Entity Exposure

```typescript
// ❌ Exposing Prisma model directly
fastify.get("/:id", async (req) => {
  return prisma.user.findUniqueOrThrow({ where: { id: req.params.id } }); // exposes internals
});

// ✅ Use a response schema/DTO
fastify.get("/:id", async (req) => {
  const user = await userService.findById(req.params.id);
  return toUserResponse(user);
});
```

---

## TypeScript/Node Code Review Checklist

### Type & Null Safety

**Check for:**
```typescript
// ❌ Unsafe assumption
const name = user.name!.toUpperCase();

// ✅ Safe with narrowing
const name = user.name ? user.name.toUpperCase() : "";

// ❌ `any` escape hatch
function process(data: any) {}

// ✅ Explicit, narrow types
function process(data: ProcessInput) {}
```

**Flags:**
- Non-null assertions (`!`) without a preceding guard
- `any` used to silence the compiler instead of modeling the type
- Optional chaining used to hide a real invariant violation
- Missing `strict: true` in `tsconfig.json`

### Error Handling

**Check for:**
```typescript
// ❌ Swallowing errors
try {
  await process();
} catch (e) { /* silent failure */ }

// ❌ Losing the cause
catch (err) {
  throw new Error("processing failed");
}

// ✅ Proper handling
catch (err) {
  log.error({ err, filename }, "failed to process file");
  throw new ProcessingError("File processing failed", { cause: err });
}
```

**Flags:**
- Empty catch blocks
- Catching and re-throwing without context or `cause`
- Unhandled promise rejections (missing `await`, fire-and-forget without `.catch`)
- Not logging errors before rethrowing at a boundary

### Resource Management

**Check for:**
```typescript
// ❌ Leak on error
const client = await pool.connect();
const result = await client.query(sql);
client.release(); // won't run if query() throws

// ✅ Always release
const client = await pool.connect();
try {
  return await client.query(sql);
} finally {
  client.release();
}
```

### Async/Transaction Boundaries

**Check for:**
```typescript
// ❌ Two separate writes, no atomicity
async function createOrder(input: OrderInput) {
  const order = await prisma.order.create({ data: input });
  await prisma.inventory.update({ where: { sku: input.sku }, data: { qty: { decrement: 1 } } });
}

// ✅ Single atomic transaction
async function createOrder(input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({ data: input });
    await tx.inventory.update({ where: { sku: input.sku }, data: { qty: { decrement: 1 } } });
    return order;
  });
}
```

### Naming Conventions

**Good:**
```typescript
// ✅ Clear intent
function findActiveUsersByRole(role: string): Promise<User[]> {}
function isEmailValid(email: string): boolean {}
function activateUser(userId: string): Promise<void> {}
```

**Bad:**
```typescript
// ❌ Unclear
function get(s: string) {}
function check(str: string) {}
function doStuff(id: string) {}
```

### Performance

**Check for:**
```typescript
// ❌ N+1 query problem
const users = await prisma.user.findMany();
for (const user of users) {
  const orders = await prisma.order.findMany({ where: { userId: user.id } }); // N queries
}

// ✅ Single query with include
const users = await prisma.user.findMany({ include: { orders: true } });

// ❌ Loading all data
const allUsers = await prisma.user.findMany(); // could be millions

// ✅ Pagination
const users = await prisma.user.findMany({ take: 20, skip: page * 20 });
```

---

## Review Output Format

```markdown
## Code Review: [Component/Feature Name]

### Critical Issues
- **Type safety violation** (user.service.ts:42) - `user.name!.toUpperCase()` can throw at runtime. Narrow the type or guard.
- **Resource leak** (db.ts:15) - pool client not released on error path. Use try/finally.

### Important Improvements
- **API design** - POST used for idempotent update (user.routes.ts:28). Use PUT instead.
- **Transaction missing** - Multi-step write needs `$transaction` (order.service.ts:56).
- **N+1 query** - Loop fetches orders individually (line 89). Use `include`.

### Code Smells
- **Long function** - `extractUserData()` is 80 lines. Consider extracting sub-functions.
- **Magic number** - Use a named constant instead of `86400` (line 123).
- **Inconsistent naming** - Mix of camelCase and snake_case in variables.

### Good Practices Observed
- ✅ Dependency injection via Fastify plugins
- ✅ DTOs/response schemas properly separate from Prisma models
- ✅ Comprehensive zod validation on all routes
- ✅ Good test coverage (87%)
```

---

## Quick Reference Flags

| Category | Red Flags |
|----------|-----------|
| **Type Safety** | `any`, non-null assertions without guards, `// @ts-ignore` |
| **Errors** | Empty catch, swallowed rejections, lost `cause` |
| **Resources** | Missing try/finally on pooled connections |
| **API Design** | Wrong HTTP verb, no versioning, model exposure |
| **Transactions** | Multi-step writes without `$transaction` |
| **Performance** | N+1 queries, loading all data, blocking the event loop |
| **Clean Code** | Code duplication, magic numbers, unclear names |

---

## Severity Levels

- **Critical** - Security, data loss, crash risk → Must fix before merge
- **Important** - Performance, maintainability, correctness → Should fix
- **Code Smell** - Style, complexity, minor issues → Nice to have
- **Good** - Positive feedback to reinforce good practices
