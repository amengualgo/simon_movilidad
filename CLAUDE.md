### 1. Plan Mode Default
- Enter plan mode for ANY not-trivial task (3+ steps or architectural decisions)
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until the mistake rate drops
- Review lessons at session start for a project

### 3. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 4. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes. Don't overengineer
- Challenge your own work before presenting it

### 5. AI Audit Trail (required for this project)
- This project is a take-home technical assessment. The final README must include an "Auditoría de IA" section documenting at least 2 concrete cases where the agentic tool suggested a deficient/insecure/non-scalable approach and how the user's judgment corrected it.
- Log candidate cases as they happen in `tasks/ai-audit-notes.md` (rejected suggestions, refactors forced by the user, simplifications explicitly chosen over a more complex agent-proposed design) — do not reconstruct this from memory at the end.
- A confirmed example already on record: reusing the Botify platform's multi-tenant/document-training architecture for the operational AI agent was considered and explicitly rejected in favor of a minimal, isolated tool-use service. Capture the reasoning verbatim when it happens again elsewhere in the project.

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards

## Project Context

Portal Corporativo de Monitoreo de Flotas — MVP for a technical assessment. Full scope and prioritization live in `PLAN.md` at the repo root (copy it in before starting). Key architecture decisions already closed — do not silently deviate from these without flagging it to the user first:

- **Async ingestion**: RabbitMQ (not Kafka) — API responds 202 immediately, validation happens in a background worker consumer. See `rabbitmq-patterns` skill.
- **Persistence**: Postgres (plain, indexed by `vehicle_id + timestamp`), explicitly NOT TimescaleDB — this is a documented simplification, state it in the README, don't silently "upgrade" it.
- **Resilience**: Circuit breaker (opossum) between the main API and the AI agent service — NOT try/catch, which is a different pattern. See `circuit-breaker-patterns` skill.
- **AI agent**: minimal, isolated tool-use service (function calling against real telemetry functions) running on **local Ollama (Qwen2.5, no API key)**, NOT a reuse of the Botify platform's multi-tenant architecture. See `ai-agent-patterns` skill.
- **Dashboard**: WebSockets for live map + chat panel (not SSE, not polling). See `websocket-patterns` skill.
- **Mobile**: React Native, offline-first via local SQLite/WatermelonDB + idempotent batch sync on reconnect. See `mobile-offline-sync` skill.
- **CI/CD**: GitHub Actions + Fastlane (documented, not necessarily executed against real store credentials).
- **Load/chaos testing**: k6 (not JMeter).
- **Diseño**: sistema de tokens único en `packages/shared/src/theme.ts` (color modo claro/oscuro, tipografía, radios, espaciado) — dashboard y app móvil lo consumen, ningún componente define colores/tipografía propios. `USER_STORIES.md` en la raíz es el catálogo de pantallas por persona (despachador/dashboard, conductor/app), usarlo como referencia antes de crear una pantalla nueva.
- **Infra**: Docker Compose para local execution; Terraform/CDK as documented reference code, not necessarily deployed.

If the time budget is tight, prioritize per the table in `PLAN.md` — implement ingestion, circuit breaker, and the AI agent fully; the rest can be partially implemented with the gap explicitly documented in the README rather than silently skipped.

## Project General Instructions

- Always use the latest versions of dependencies.
- Always write backend code as Fastify 5 plugins/routes; frontend code as React 18 + Vite.
- Always use npm workspaces + Turborepo for monorepo dependency management.
- Always create test cases for the generated code both positive and negative (Vitest).
- Always generate the GitHub Actions pipeline in .github/workflows to verify the code.
- Minimize the amount of code generated.
- The npm package name must be the same as the parent directory name.
- Use semantic versioning for each workspace package. Each time you generate a new version, bump the PATCH section of the version number.
- Use zod for runtime validation on all Fastify routes; no manual validation.
- Generate the Docker Compose file to run all components used by the application (RabbitMQ, Postgres, backend API, worker, frontend).
- Update README.md each time you generate a new version, including any newly documented simplification or scope cut.
