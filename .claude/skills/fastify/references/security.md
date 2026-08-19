# Fastify Security Reference

## JWT Authentication

```typescript
import fastifyJwt from "@fastify/jwt";

await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!, // never hardcode; fail fast if missing
});

// Issue a token
fastify.post("/login", async (req, reply) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await authService.verifyCredentials(email, password);
  const token = fastify.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: "1h" });
  return { token };
});

// Protect routes
fastify.addHook("preHandler", async (req, reply) => {
  if (req.routeOptions.url === "/health" || req.routeOptions.url === "/login") return;
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
});
```

## Password Hashing

```typescript
import bcrypt from "bcryptjs";

const hash = await bcrypt.hash(password, 12); // cost factor 12 - tune for your latency budget
const valid = await bcrypt.compare(password, hash);
```

**Flags:**
- Storing plaintext or reversibly-encrypted passwords
- A bcrypt cost factor below 10 for new code
- Comparing hashes with `===` instead of a constant-time `compare`

## CORS

```typescript
import cors from "@fastify/cors";

await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowed = (process.env.CORS_ORIGINS ?? "").split(",");
    cb(null, !origin || allowed.includes(origin));
  },
  credentials: true,
});
```

**Flags:**
- `origin: "*"` combined with `credentials: true` (browsers reject this, and it's unsafe if they didn't)
- Allowlist sourced from a hardcoded array instead of env config

## Security Headers (Helmet)

```typescript
import helmet from "@fastify/helmet";

await fastify.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
});
```

## Rate Limiting

```typescript
import rateLimit from "@fastify/rate-limit";

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Per-route override for sensitive endpoints
fastify.post("/login", {
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
}, loginHandler);
```

## Webhook Signature Verification (HMAC)

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  return expectedBuf.length === signatureBuf.length && timingSafeEqual(expectedBuf, signatureBuf);
}

fastify.post("/webhook", { config: { rawBody: true } }, async (req, reply) => {
  const signature = req.headers["x-signature"] as string;
  if (!verifySignature(req.rawBody, signature, process.env.WEBHOOK_SECRET!)) {
    return reply.code(401).send({ error: "Invalid signature" });
  }
  await inboundQueue.add("event", JSON.parse(req.rawBody.toString()));
  return reply.code(200).send({ received: true });
});
```

**Flags:**
- Comparing signatures with `===` instead of `timingSafeEqual` (timing attack)
- Verifying against a parsed/re-serialized body instead of the exact raw bytes received
- Processing the webhook payload synchronously instead of acking fast and queuing

## Secrets Management

- Load all secrets from environment variables, validated at startup with a zod schema — fail fast on missing/malformed config rather than at first use.
- Never log secrets; configure logger `redact` paths (see `logging-patterns` skill).
- Use distinct secrets per environment; rotate on suspected exposure.

```typescript
const envSchema = z.object({
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  WEBHOOK_SECRET: z.string().min(16),
});

export const env = envSchema.parse(process.env); // throws immediately on startup if misconfigured
```
