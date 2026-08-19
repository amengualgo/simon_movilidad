# Portal Corporativo de Monitoreo de Flotas — Simón Movilidad (Prueba Técnica Senior Fullstack)

Repositorio del proyecto: pipeline de ingesta de telemetría vía Fastify + RabbitMQ, persistencia en Postgres, agente de consultas de IA protegido por circuit breaker, dashboard React con actualizaciones en vivo por WebSocket, y app de conductor React Native offline-first.

Este proyecto nació a partir de una capa de configuración de Claude Code adaptada de `template_typescript_fastify` (sustituyendo BullMQ por RabbitMQ y añadiendo agentes/skills propios para el agente de IA, el circuit breaker, el broadcast de WebSocket y la sincronización offline móvil). Ver `PLAN.md` en la raíz del repo para el alcance completo, la priorización, y las decisiones de arquitectura ya cerradas.

Para retomar el desarrollo con Claude Code: clona este repositorio y dale el primer prompt sugerido más abajo en este README.

```shell
.
├── .claude
│   ├── agents
│   │   ├── ai-agent-engineer.md
│   │   ├── code-reviewer.md
│   │   ├── devops-engineer.md
│   │   ├── docker-expert.md
│   │   ├── fastify-engineer.md
│   │   ├── mobile-engineer.md
│   │   ├── react-engineer.md
│   │   └── security-engineer.md
│   ├── settings.local.json
│   └── skills
│       ├── README.md
│       ├── ai-agent-patterns
│       │   └── SKILL.md
│       ├── circuit-breaker-patterns
│       │   └── SKILL.md
│       ├── code-quality
│       │   └── SKILL.md
│       ├── design-patterns
│       │   └── SKILL.md
│       ├── fastify
│       │   ├── SKILL.md
│       │   └── references
│       │       ├── data.md
│       │       ├── security.md
│       │       ├── testing.md
│       │       └── web.md
│       ├── logging-patterns
│       │   └── SKILL.md
│       ├── mobile-offline-sync
│       │   └── SKILL.md
│       ├── prisma-patterns
│       │   └── SKILL.md
│       ├── rabbitmq-patterns
│       │   └── SKILL.md
│       ├── react-dashboard
│       │   └── SKILL.md
│       └── websocket-patterns
│           └── SKILL.md
├── .claude-plugin
│   └── plugin.json
├── CLAUDE.md
├── LICENSE
├── README.md
└── package.json
```

## Stack

- **Monorepo**: npm workspaces + Turborepo, TypeScript, Node >=20
- **Backend API** (`apps/api`): Fastify 5, validación con Zod, Prisma ORM (PostgreSQL — no TimescaleDB, simplificación documentada), RabbitMQ (amqplib) para ingesta asíncrona, circuit breaker con opossum hacia el servicio de agente de IA, @fastify/websocket para broadcast en vivo, @fastify/jwt + @fastify/cors + @fastify/helmet + @fastify/rate-limit
- **Worker de ingesta** (`apps/worker`): consume `telemetry.raw`, ejecuta la validación completa, persiste de forma idempotente, hace broadcast por WebSocket, envía a dead-letter los mensajes inválidos
- **Servicio de agente de IA** (`apps/ai-agent`): servicio aislado y mínimo de tool-use — function calling contra consultas de telemetría tipadas y de solo lectura, corriendo en **Ollama local (Qwen2.5) — sin necesidad de API key**. Deliberadamente no es una reutilización de ninguna plataforma de agentes multi-tenant más grande.
- **Dashboard** (`apps/web`): React 18 + Vite, mapa real en vivo (`react-leaflet` + tiles OpenStreetMap, no un placeholder de lista ni una imagen estática) + panel de alertas + chat de IA vía WebSocket, drawer de detalle de vehículo (DW-04), TanStack Query v5 para datos vía REST, Tailwind CSS con clases semánticas del theme, tema claro/oscuro vía `ThemeProvider` + variables CSS (ver `apps/web/src/index.css`)
- **App de conductor** (`apps/mobile`): React Native (Expo SDK 57), captura offline-first, sincronización por lotes idempotente al reconectar, CI/CD con Fastlane + GitHub Actions. 5 pantallas de conductor implementadas (DM-01 a DM-05); almacenamiento local sobre `expo-sqlite` (WatermelonDB se descartó por requerir `expo prebuild`/linking nativo no verificable en este entorno) — persistencia real en dispositivo sin verificar, gap documentado, ver `apps/mobile/README.md`
- **Pruebas de carga/caos**: script de k6 que simula ~300 vehículos con 10% de payloads duplicados y 5% de payloads malformados
- **Infra**: Docker Compose (RabbitMQ, Postgres, api, worker, ai-agent, web); Terraform/CDK como IaC de referencia documentada
- **Testing**: Vitest (tests unitarios + tests de integración con `fastify.inject()`, React Testing Library para componentes)
- **CI**: GitHub Actions

Este template deliberadamente no genera código fuente de aplicación — solo provee la capa de configuración de Claude Code (agentes, skills, settings, instrucciones de proyecto) más una identidad mínima de `package.json`, la misma convención que los demás templates de este repositorio. El código fuente real de `apps/*`/`packages/*` lo genera Claude usando las skills de arriba una vez que empiezas a construir, siguiendo las decisiones ya cerradas en `PLAN.md`.

### Justificación de decisiones de datos (Kafka vs. RabbitMQ, TimescaleDB vs. Postgres plano)

**RabbitMQ en vez de Kafka.** El enunciado nombra Kafka como referencia del stack de la plataforma real, pero para el volumen y la topología de esta prueba (un solo tipo de evento, un solo consumidor lógico — el worker de persistencia, sin necesidad de replay de eventos históricos ni de múltiples consumer groups leyendo el mismo stream con offsets independientes) RabbitMQ cubre exactamente lo que se necesita — colas de trabajo con ack/nack manual, dead-letter exchange para payloads inválidos, prefetch para controlar concurrencia — con una complejidad operativa mucho menor que levantar y coordinar un cluster de Kafka (o Zookeeper/KRaft) para correr localmente en Docker Compose. Kafka se justifica cuando hay múltiples consumidores independientes leyendo el mismo log de eventos con necesidad de replay (ej. un consumidor de persistencia y uno de analítica en paralelo, cada uno a su propio ritmo) — no es el caso de este MVP, donde un único consumidor procesa y persiste. Ver skill `rabbitmq-patterns` para el detalle de los patrones aplicados (publisher confirms, idempotencia por `eventId`, dead-lettering).

**Postgres plano en vez de TimescaleDB.** La justificación real: TimescaleDB (o Cassandra) es la elección correcta cuando el volumen de series de tiempo excede lo que un índice B-tree de Postgres puede sostener cómodamente — miles de dispositivos reportando cada pocos segundos, retención de meses/años, y queries de agregación sobre rangos temporales masivos (para eso existen los *hypertables* con particionamiento automático por tiempo). Para el volumen real de esta prueba (unos cientos de vehículos simulados vía k6, retención de horas/días en un entorno de demo) un índice compuesto `(vehicleId, capturedAt)` sobre una tabla Postgres normal ya resuelve las consultas que el dashboard y el agente de IA necesitan (historial de un vehículo, vehículos detenidos por zona) sin la complejidad operativa adicional de una extensión especializada. Es una simplificación **consciente y documentada**, no una omisión: si el alcance creciera a "miles de dispositivos" en producción real, TimescaleDB (hypertables + compresión + políticas de retención automática) sería la migración natural sin cambiar el modelo de datos ni las queries de Prisma — solo la extensión de Postgres.

## Quick Start (para quien revise esta prueba)

### 1. Backend + dashboard (Docker Compose — igual en Windows, Mac y Linux)

```bash
cp .env.example .env    # no requiere ninguna key — usa Ollama local por defecto
docker compose up -d
```

Levanta los 7 servicios (RabbitMQ, Postgres, Ollama, `api`, `worker`, `ai-agent`, `web`). El primer arranque tarda más de lo normal porque `ollama` descarga el modelo (`qwen2.5:3b`, ~2GB). Las migraciones de Prisma se aplican solas (`prisma migrate deploy` corre en el `CMD` de cada servicio) — no hace falta ningún paso manual de base de datos.

Verificar que todo quedó arriba:
```bash
docker compose ps
```
Todos los servicios deben quedar `Up` (postgres/rabbitmq/ollama además `healthy`).

- **Dashboard**: http://localhost:5173
- **API**: http://localhost:3000
- **RabbitMQ management UI**: http://localhost:15672 (usuario/clave: `fleet`/`fleet`)

Para ver el mapa poblado con datos de prueba (simula ~300 vehículos, incluye payloads inválidos/duplicados a propósito):
```bash
docker run --rm -i --network host -v "$(pwd)/k6:/k6" grafana/k6 run --env API_URL=http://localhost:3000 /k6/load-test.js
```
(En Windows, si `--network host` no aplica en Docker Desktop, correr k6 nativo en su lugar — ver `k6/load-test.js` para el comando `k6 run` directo, o pegar el load test contra `http://host.docker.internal:3000` como `API_URL`.)

Para bajar todo: `docker compose down` (agregar `-v` solo si además quieres borrar los datos de Postgres).

### 2. App móvil (`apps/mobile`) — Node nativo, no Docker

Este paso corre fuera de Docker a propósito: Expo necesita exponer su servidor en la red real de tu máquina para que el teléfono se conecte, y `docker run --network host` no funciona igual en Windows/Mac (Docker Desktop corre en una VM ahí) como en Linux. Con Node normal en el host, el comportamiento es idéntico en los tres sistemas operativos.

Requisito: Node 20+ instalado ([nodejs.org](https://nodejs.org)) y la app **Expo Go** en tu teléfono (App Store / Play Store).

```bash
npm install                       # desde la raíz del repo (monorepo, npm workspaces)
cd apps/mobile
npx expo start
```

Esto imprime un código QR en la terminal — escanéalo con la cámara del teléfono (iOS) o desde dentro de la app Expo Go (Android). El teléfono y la máquina donde corres `expo start` deben estar en la **misma red WiFi**.

**Importante — `EXPO_PUBLIC_API_URL`**: por defecto la app apunta a `http://localhost:3000`, que desde el teléfono no significa nada (apunta al propio teléfono). Hay que apuntarlo a la IP de tu máquina en la red local:

```bash
# .env en apps/mobile/ (o variable de entorno antes de "npx expo start")
EXPO_PUBLIC_API_URL=http://<tu-ip-local>:3000
```

Cómo encontrar tu IP local según el sistema operativo:
- **Windows**: `ipconfig` (buscar "Dirección IPv4" de tu adaptador WiFi/Ethernet activo)
- **Mac**: `ipconfig getifaddr en0` (o `en1` si usas Ethernet)
- **Linux**: `hostname -I` o `ip addr`

Con `api` escuchando en `0.0.0.0` (ya configurado así en `docker-compose.yml`), es alcanzable desde el teléfono en esa IP mientras ambos estén en la misma red.

## Auditoría de IA

Registro en vivo de casos donde el agente sugirió (o el código generado terminó teniendo) un enfoque deficiente, inseguro o no escalable, y cómo se corrigió con criterio propio — no reconstruido de memoria al final, capturado a medida que pasaba en `tasks/ai-audit-notes.md` (12 casos en total; los 4 más representativos quedan acá).

**1. Reutilizar la arquitectura de Botify (plataforma propia, multi-tenant) para el agente de IA — descartado.** Al planear el "Agente Operativo" del enunciado, la opción de menor fricción aparente era reutilizar la arquitectura ya existente del autor para un producto propio: multi-cliente, entrenamiento sobre documentación, integraciones externas. Esa complejidad no aporta nada al alcance real de esta prueba (responder preguntas puntuales sobre el estado de la flota) — adoptarla habría sido sobre-ingeniería pura, consumiendo tiempo que el ejercicio no tiene. Se construyó en su lugar `apps/ai-agent` como servicio aislado y minimalista: un único endpoint `/query`, function calling contra un puñado de funciones tipadas y de solo lectura (`getStoppedVehicles`, `getVehiclesByZone`), sin estado de sesión, sin multi-tenant.

**2. El mockup importado sugería un mapa como imagen estática — se corrigió a un mapa real.** El mockup del dashboard (vía Claude Design) resolvía el mapa con una imagen PNG estática de Bogotá y marcadores en posiciones de píxel fijas, hardcodeadas a mano — conveniente para una herramienta de diseño, pero sin ninguna relación con el `lat`/`lng` real que manda la telemetría. Implementado tal cual habría sido una fachada: se vería bien en una captura de pantalla, pero no sería un mapa funcional. Se integró `react-leaflet` + OpenStreetMap en su lugar, proyectando coordenadas reales de cada vehículo — se conservó del mockup solo el lenguaje visual (color por estado, anillo de pulso, leyenda), no su mecanismo de posicionamiento.

**3. Timeout del circuit breaker copiado del ejemplo genérico de una skill, sin ajustar al caso real.** `circuit-breaker.ts` traía `timeout: 5000` — el valor literal del ejemplo de la skill `circuit-breaker-patterns` (pensado para una llamada HTTP típica a un servicio en la nube), pese a que la skill `ai-agent-patterns` (del mismo repo) advierte explícitamente no reutilizar un timeout pensado para un proveedor cloud cuando el LLM corre local. Resultado medible: el chat del dashboard caía al fallback en el 100% de las consultas reales, con Ollama funcionando perfectamente bien — el breaker abría antes de que el modelo alcanzara a responder. Medido contra el `ollama` real del proyecto (no estimado): una sola llamada de `qwen2.5:3b` en CPU tardó 62.5s, y el agente hace 2 llamadas secuenciales por consulta. Corregido subiendo el timeout a 120s, con la medición documentada en el propio comentario del código para que no se pierda el porqué.

**4. WatermelonDB ya estaba instalado — se descartó igual por no ser verificable en el entorno.** Al cerrar el gap de storage offline de `apps/mobile`, `@nozbe/watermelondb` ya figuraba como dependencia instalada — la opción de menor fricción aparente era simplemente cablearla. Pero su adaptador SQLite típicamente requiere `expo prebuild` + linking nativo, y el entorno de generación no tiene Xcode ni Android SDK para siquiera intentar ese build. Cablearla igual habría producido código que "compila" pero nunca se prueba contra un dispositivo real — el mismo gap ya documentado para otras piezas del proyecto, sin ganar nada a cambio. Se usó `expo-sqlite` en su lugar (funciona en managed workflow sin `prebuild`) y se sacó la dependencia sin usar del `package.json` en vez de dejarla como peso muerto.

Los 8 casos restantes (incluyendo el rate-limit global que tumbaba el 99% de la ingesta bajo `k6/load-test.js` real, y decisiones de diseño más pequeñas) están documentados con el mismo nivel de detalle en `tasks/ai-audit-notes.md`.

## Estado real de este proyecto (actualizado)
- `packages/shared/src/theme.ts`: **sistema de diseño único** (tokens de color modo claro/oscuro, tipografía, radios, espaciado) — dashboard y app móvil consumen los mismos valores, no colores sueltos por pantalla. Ver `USER_STORIES.md` para el catálogo de pantallas a diseñar/mockear, referenciando estos tokens.
- `packages/shared`: schemas Zod (`rawTelemetrySchema`, `validatedTelemetrySchema`) y contrato de mensajes WebSocket, compartidos entre todos los servicios.
- `apps/api`: ruta `POST /telemetry` (202 inmediato, publica a RabbitMQ), `POST /telemetry/batch` (usado por la app móvil), `POST /chat` (envuelto en circuit breaker hacia `ai-agent`, con rate limit propio de 20 req/min — ver nota abajo), `GET /vehicles/:vehicleId/history` (historial de posiciones + distancia recorrida, alimenta el drawer de detalle DW-04), `GET /ws/fleet` (WebSocket), health check.
- `apps/worker`: consumidor de `telemetry.raw`, validación de negocio completa, persistencia idempotente (upsert por `eventId`), actualización de `VehicleStatus`, publicación al exchange fanout de broadcast, dead-lettering de payloads inválidos.
- `apps/ai-agent`: servicio aislado con 2 tools (`getStoppedVehicles`, `getVehiclesByZone`), bucle de tool-use de un turno detrás de una interfaz `LLMProvider` (patrón Strategy) — por defecto **Ollama local (Qwen2.5:7b, sin API key)**, intercambiable a **OpenAI (de pago)** cambiando `LLM_PROVIDER=openai` + `OPENAI_API_KEY` en `.env`. Ver `apps/ai-agent/src/providers/`.
- `apps/web`: dashboard React implementado a partir de los mockups importados de Claude Design (`Mockups Portal Flotas.dc.html`) — `useFleetSocket` (reconexión con backoff), `FleetMap` (mapa real con `react-leaflet`, marcadores con anillo de "pulso" solo en `moving`/`critical`, leyenda), `VehicleDetailDrawer` (DW-04: stats, mini-mapa de recorrido real, tabla de posiciones, alertas del vehículo — antes no implementado), `AlertsPanel`, `ChatPanel` (con estado "degradado" visible cuando el circuit breaker hacia `ai-agent` cae al fallback), header con contadores de flota en vivo y toggle de tema, oscuro por defecto.
- `apps/mobile`: proyecto Expo (TypeScript, SDK 57) ya inicializado, con las 5 pantallas del conductor implementadas (DM-01 a DM-05: captura + estado offline, toast de sync, inicio/fin de turno, resumen de jornada) sobre la lógica core ya existente (`offlineStore.ts`, `syncWorker.ts`, sin reescribir). Verificado con `tsc --noEmit`, `vitest` y un bundle real de Metro (`expo export`) — sin dispositivo/emulador disponible en este entorno, así que la captura de GPS real contra hardware sigue sin verificar end-to-end. Ver `apps/mobile/README.md` para el detalle completo de qué se verificó y qué gaps quedan documentados (persistencia SQLite real en dispositivo sin verificar — sí se verificó el contrato vía `vitest` con un driver falso inyectado; sin tests automatizados de componentes RN, con la causa exacta explicada).
- `prisma/schema.prisma`: modelos `TelemetryEvent` y `VehicleStatus`.
- `docker-compose.yml` + `Dockerfile` por servicio: levanta RabbitMQ, Postgres, api, worker, ai-agent, web con un solo `docker compose up`.
- `k6/load-test.js`: simula ~300 vehículos, 10% duplicados, 5% payloads inválidos. Correrlo (sin instalar k6, usando Docker): `docker run --rm -i --network host -v "$(pwd)/k6:/k6" grafana/k6 run --env API_URL=http://localhost:3000 /k6/load-test.js`. Este load test destapó un bug real: `@fastify/rate-limit` estaba registrado global (100 req/min por IP) y tumbaba con `429` el 99% de la ingesta — contradice la decisión de arquitectura de ingesta asíncrona de alto volumen. Corregido: el plugin ahora es `global: false`, y solo `/chat` activa un límite propio (20 req/min, protege al agente de IA); `/telemetry` queda sin límite artificial — el backpressure real es RabbitMQ + prefetch del worker.
- `.github/workflows/ci.yml` y `mobile.yml`.
- `infra/terraform/main.tf`: referencia de IaC, no desplegada (documentado explícitamente).
- `tasks/ai-audit-notes.md`: 12 casos de auditoría de IA documentados (incluye la decisión de reemplazar el mapa-imagen-estática del propio mockup por un mapa real con `react-leaflet`, el rate limit global que tumbaba el 99% de la ingesta bajo carga real, el timeout del circuit breaker copiado del ejemplo genérico de la skill sin ajustar a la latencia real de inferencia local, y descartar WatermelonDB pese a estar ya instalado por no ser verificable en este entorno).
- **Tests (Vitest, positivos y negativos, trazables a `USER_STORIES.md`)**: `packages/shared` (validación de schemas), `apps/worker` (idempotencia de persistencia — DW-01/DM-02/DM-03), `apps/api` (rutas de ingesta, chat, historial de vehículo, y el circuit breaker aislado — DW-01/DW-03/DW-04/DW-06), `apps/ai-agent` (tools de consulta y factory de proveedores), `apps/web` (`App`, `FleetMap`, `AlertsPanel`, `ChatPanel`, `VehicleDetailDrawer`, `ThemeToggle` — DW-01 a DW-06), `apps/mobile` (sync offline idempotente — DM-01/DM-02/DM-03 — más `geo.ts`/`localStore.ts`, lógica pura sin `react-native`; las pantallas RN en sí no tienen test automatizado, ver `apps/mobile/README.md`). Cada `describe`/`it` referencia el ID de HU que cubre en su comentario. Suite completa verificada de punta a punta con `npm run test` en los 6 workspaces (81 tests) más `tsc`/`vite build`/`expo export` en cada app con build propio — no solo reportado por cada agente de forma aislada.

### Qué falta
- `cp .env.example .env` en la raíz (no requiere ninguna key — usa Ollama local).
- ~~`docker compose up` para levantar todo~~ — ver sección "Quick Start" arriba. `ollama` descarga `qwen2.5:3b` (~2GB) en el primer arranque. El timeout del circuit breaker hacia `ai-agent` (120s) ya está calibrado para inferencia local en CPU sin GPU — una respuesta del chat puede tardar hasta 1-2 minutos, es esperado, no un bug.
- ~~`npx prisma migrate dev` manual para crear las tablas~~ — automatizado: el `CMD` de `api`/`worker`/`ai-agent` corre `prisma migrate deploy` antes de arrancar, así que cualquier `docker compose up` en limpio aplica las migraciones solo, sin paso manual. Sigue haciendo falta generar la migración inicial una sola vez (`prisma migrate dev --name init`, ya comiteada en `prisma/migrations/`) — eso es autoría de schema, no algo que `migrate deploy` pueda hacer por sí solo.
- ~~Sustituir `FleetMap` por un mapa real~~ — hecho (`react-leaflet`, ver arriba).
- ~~Inicializar el proyecto Expo real en `apps/mobile`~~ — hecho (ver `apps/mobile/README.md`).
- ~~Cablear el `LocalStore` en memoria a un storage nativo real~~ — hecho: `expo-sqlite` (ver Caso 12 en `tasks/ai-audit-notes.md` sobre por qué no WatermelonDB). Queda pendiente verificar la persistencia SQLite y la captura de GPS contra un dispositivo/emulador real — sin Xcode/Android SDK en este entorno.
- ~~Diseñar/mockear el detalle de vehículo del dashboard (DW-04)~~ — hecho: mockups importados de Claude Design e implementados como `VehicleDetailDrawer` + `GET /vehicles/:id/history`. El "conductor asignado" que muestra el drawer (nombre, avatar, horario de turno) es un dato **mock** — todavía no existe un modelo `Driver`/`Vehicle` en el schema de Prisma que lo respalde; el botón "Contactar" es solo visual, no dispara ninguna acción real. Documentado también en el propio componente.
- Grabar el video de sustentación.
- Datos de catálogo reales (placa/unidad/modelo/año de vehículo, conductor asignado) — hoy solo existe `VehicleStatus`/`TelemetryEvent` (posición + estado derivado); un modelo `Vehicle`/`Driver` es la extensión natural cuando el alcance lo requiera.

### Verificación final de esta sesión (mockups → código)
Al correr `npm run test` de punta a punta en los 6 workspaces por primera vez (no solo por paquete, como venían verificando los subagentes en paralelo), aparecieron 4 bugs reales preexistentes, no introducidos por esta sesión, que bloqueaban `apps/api`/`apps/worker`:
- `apps/api/src/lib/rabbitmq.ts` creaba el canal con `createChannel()` y llamaba `confirmSelect()` manualmente — ese método no existe en el tipo `Channel` de `amqplib`, solo en `ConfirmChannel`. Corregido usando `connection.createConfirmChannel()` directamente (el canal ya nace en modo publisher-confirms).
- `apps/api/src/lib/ws-broadcast.ts` no tenía `@types/ws` instalado (dependencia transitiva de `@fastify/websocket`, nunca declarada explícitamente) — instalado como devDependency.
- `apps/api/src/routes/ws.ts` leía `connection.socket`, API del plugin `@fastify/websocket` v8/v9; la v11 ya instalada (`^11.0.0`) pasa el `WebSocket` crudo directo como primer argumento — corregido para usar `connection` sin `.socket`.
- El mock de Prisma en `apps/worker/src/__tests__/persist.test.ts` no simulaba el `updatedAt` automático de Prisma (columna `@updatedAt`), así que `persistTelemetryEvent` fallaba en el mock con `updatedAt` `undefined` — un error que no existe contra una Postgres real. Corregido en el mock, no en `persist.ts` (que ya era correcto).

Con estos 4 fixes, `npm run test` pasa limpio en los 6 workspaces (81 tests) y cada app compila/buildea (`tsc`, `vite build`, `expo export`).

### Bugs reales encontrados corriendo el stack completo bajo carga (post-mockups)
Verificar contra Docker real (no solo `npm run test`) destapó 4 bugs que ningún test unitario cubría:
- **Rate limit global tumbando la ingesta**: `@fastify/rate-limit` estaba registrado sobre toda la API (100 req/min por IP) — bajo `k6/load-test.js` real, el 99.3% de `POST /telemetry` volvía `429`. Corregido a `global: false` + límite propio solo en `/chat` (20 req/min, protege al agente de IA). Ver Caso 10 en `tasks/ai-audit-notes.md`.
- **Migraciones de Prisma nunca generadas**: `prisma/migrations/` no existía — el worker fallaba con `relation "telemetry_events" does not exist`. Se generó la migración inicial (`prisma migrate dev --name init`, ya comiteada) y se automatizó `prisma migrate deploy` en el `CMD` de `api`/`worker`/`ai-agent`, así que ningún entorno nuevo requiere pasos manuales.
- **Chat de IA siempre en fallback ("Agente no disponible"), causa 1 — mismatch de modelo**: `docker-compose.yml` le pedía a `ai-agent` el modelo `OLLAMA_MODEL: qwen2.5:7b`, pero el servicio `ollama` solo descarga `qwen2.5:3b` en su arranque — mismatch entre las dos líneas del propio compose (el `.env.example` de `ai-agent` sí tenía el valor correcto, `3b`). Cada consulta fallaba con `model 'qwen2.5:7b' not found`. Corregido alineando `OLLAMA_MODEL` a `qwen2.5:3b` en `docker-compose.yml`.
- **Chat de IA siempre en fallback, causa 2 — timeout del circuit breaker demasiado corto para inferencia local**: con el mismatch de arriba ya corregido, el chat seguía cayendo al fallback. Medido contra `ollama` real: una sola llamada de `qwen2.5:3b` en CPU (sin GPU) tardó **62.5s**, y `agent.ts` hace 2 llamadas secuenciales al LLM por consulta (decidir tool + sintetizar respuesta). El circuit breaker en `apps/api/src/lib/circuit-breaker.ts` tenía `timeout: 5000` — el valor de ejemplo tal cual de la skill `circuit-breaker-patterns` (pensado para una llamada HTTP normal a un servicio en la nube), copiado sin ajustar pese a que la propia skill `ai-agent-patterns` advierte explícitamente no hacerlo. Corregido subiendo el timeout a 120s. Ver Caso 11 en `tasks/ai-audit-notes.md`.
- **Crash del drawer de detalle de vehículo (DW-04)**: `VehicleDetailDrawer.tsx` pasaba `icon={isCritical ? pulsingDivIcon() : undefined}` al `<Marker>` de react-leaflet — a diferencia de un `<img>` HTML, react-leaflet **no** cae al ícono por defecto cuando `icon` llega `undefined`, sobrescribe la opción y crashea en `_initIcon` (pantalla en blanco, sin error boundary). Reproducible en casi cualquier vehículo no crítico. Corregido con un `plainDivIcon()` explícito para el caso no crítico (mismo patrón que ya usaba `FleetMap.tsx`, que nunca tuvo este bug). El mock de `react-leaflet` en `VehicleDetailDrawer.test.tsx` ahora lanza si `icon` llega `undefined`, para que una regresión de este tipo rompa el test en vez de pasar silenciosamente.
- **Reentrega de telemetría rompía el worker en vez de absorberse**: `apps/worker/src/persist.ts` hacía `prisma.telemetryEvent.upsert({ where: { eventId }, create: {...}, update: {} })` — con `update: {}` vacío, Prisma no genera la cláusula `ON CONFLICT DO UPDATE` real de Postgres y cae a un `INSERT` sin protección de conflicto. Una reentrega del mismo `eventId` (justo el caso que el upsert existe para manejar — retries de RabbitMQ, reintentos del batch sync de `apps/mobile`) tiraba `PrismaClientKnownRequestError P2002: Unique constraint failed on eventId` en vez de absorberse en silencio. Detectado con telemetría real de un dispositivo Android (no en tests — el mock de Prisma en `persist.test.ts` no reproducía este comportamiento de Prisma, así que el test seguía en verde). Corregido reasignando `eventId` a sí mismo en el `update` (no cambia ningún dato, pero fuerza el `ON CONFLICT DO UPDATE` real).

### Nota sobre el sistema de diseño y su limitación conocida
Los tokens de color/tipografía viven en un único lugar (`packages/shared/src/theme.ts`), pero Tailwind carga su config vía Node sin transpilar TS del workspace automáticamente — por eso `apps/web/src/index.css` tiene los mismos valores "hardcodeados" como variables CSS, generados manualmente a partir de `theme.ts`. Si cambias un color, cámbialo primero en `theme.ts` y refleja el mismo valor en `index.css` — está comentado explícitamente en ambos archivos. Esto es una limitación de tooling documentada, no un descuido; si el tiempo alcanza, se podría automatizar con un pequeño script de build que genere `index.css` desde `theme.ts`.

### Primer prompt sugerido para Claude Code al llegar a casa
> "Lee CLAUDE.md, PLAN.md y el README de cada apps/*. Instala dependencias, levanta docker-compose, corre las migraciones de Prisma, y verifica que POST /telemetry → worker → Postgres → WebSocket → dashboard funciona de punta a punta con un evento de prueba. Reporta qué falla antes de seguir construyendo."

