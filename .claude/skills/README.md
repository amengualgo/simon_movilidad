# Skills

Skills are reusable prompts that teach Claude specific patterns for this fleet telemetry monorepo.

## Structure Convention

Each skill folder contains:

| File | Purpose | Audience |
|------|---------|----------|
| `SKILL.md` | Instructions for Claude | AI (loaded with `view`) |

## Available Skills

### Code Quality
| Skill | Description |
|-------|-------------|
| [code-quality](code-quality/) | Clean code, API contract review, TypeScript code review checklist |
| [design-patterns](design-patterns/) | Factory, Builder, Strategy, Observer, Decorator, Adapter with TS examples |

### Framework & Data
| Skill | Description |
|-------|-------------|
| [fastify](fastify/) | Fastify 5.x backend: REST APIs, validation, security |
| [react-dashboard](react-dashboard/) | React 18 + Vite live fleet dashboard: WebSocket data, forms, state, UI |
| [prisma-patterns](prisma-patterns/) | Prisma ORM pitfalls (N+1, transactions, migrations, pooling) |
| [logging-patterns](logging-patterns/) | Structured logging (JSON) with Pino, request correlation |

### Fleet Telemetry Platform (project-specific)
| Skill | Description |
|-------|-------------|
| [rabbitmq-patterns](rabbitmq-patterns/) | RabbitMQ async ingestion: publisher confirms, ack/nack, dead-letter, idempotent consumers |
| [circuit-breaker-patterns](circuit-breaker-patterns/) | Circuit breaker (opossum) between services — and why it isn't try/catch |
| [ai-agent-patterns](ai-agent-patterns/) | Function-calling fleet query agent, isolated and minimal by design |
| [websocket-patterns](websocket-patterns/) | Live dashboard updates via @fastify/websocket, reconnection, broadcast boundaries |
| [mobile-offline-sync](mobile-offline-sync/) | React Native offline-first capture + idempotent batch sync |

## Adding a New Skill

### Before You Start

Validate your skill idea against existing skills:

- [ ] **No significant overlap** - check the table above for similar skills
- [ ] **Unique value** - what does it add that doesn't exist?
- [ ] **Focused scope** - can be applied in one session

### Implementation Steps

1. Create folder: `.claude/skills/<skill-name>/`
2. Create `SKILL.md` with instructions for Claude
3. Update this table
4. Update the template's root `README.md` if the file tree changed

## Usage

Skills are automatically loaded by Claude Code based on context. You can also invoke them directly:

```bash
# Automatic - Claude detects when to use skills
> "Implementa el endpoint de ingesta de telemetría"   # Loads fastify + rabbitmq-patterns
> "Añade el circuit breaker hacia el agente de IA"     # Loads circuit-breaker-patterns
> "Por qué se duplican los eventos offline al sincronizar"  # Loads mobile-offline-sync

# Manual - invoke with slash command
> /rabbitmq-patterns
> /ai-agent-patterns
```

## Learn More

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) - Official guide on creating and using skills
