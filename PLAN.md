# Plan Técnico — Portal Corporativo de Monitoreo de Flotas
### Prueba técnica Senior Fullstack — Simón Movilidad

Este documento es la guía de arquitectura y alcance para orquestar el desarrollo con IDE agéntico (Claude Code). Recoge las decisiones ya tomadas, su justificación, y qué se implementa a fondo vs. qué se documenta como diseño.

---

## 0. Principio rector

**No se busca un MVP funcional al 100% de cada punto del enunciado.** Se busca demostrar criterio senior: qué se construye de verdad, qué se simplifica conscientemente, y por qué. Toda simplificación debe quedar explícita en el README, no oculta.

Antes de empezar a construir: **confirmar con el reclutador la fecha límite real de entrega** (el documento solo da una estimación de horas de esfuerzo, no un deadline). Ver plantilla de mensaje al final de este documento.

---

## 1. Decisiones de arquitectura ya tomadas

### 1.1 Ingesta asíncrona — RabbitMQ (no Kafka)

- **Flujo:** API recibe el evento de telemetría → responde `202 Accepted` inmediatamente, sin validar en el hilo principal → publica el mensaje crudo en una cola de RabbitMQ → un worker consumidor lo saca de la cola, lo valida → si es válido, lo persiste; si no, va a una cola de dead-letter para inspección.
- **Justificación para el README:** RabbitMQ se elige sobre Kafka porque el volumen esperado (miles de vehículos, no millones de eventos/seg con necesidad de replay o particionado por consumer groups) no exige las garantías de Kafka. Es una decisión de experiencia previa validada en producción (logger de transacciones), lo que reduce riesgo operativo dado el tiempo disponible.
- **Patrón:** cola de trabajo (work queue), no streaming de eventos con retención larga.

### 1.2 Persistencia

- Los datos de telemetría (posición GPS de alta frecuencia, miles de vehículos) se persisten **después** de la validación en el worker.
- **Decisión de tiempo:** usar **Postgres plano** en lugar de TimescaleDB (nunca se ha usado), indexado por `(vehicle_id, timestamp)`.
- **Justificación para el README (obligatoria, explícita):** "En producción se usaría TimescaleDB por sus hipertablas y compresión nativa para series temporales de alta frecuencia. Aquí se usa Postgres estándar con índices compuestos como simplificación consciente dado el alcance de la prueba, sin comprometer el modelo de datos ni las consultas."
- Si sobra tiempo al final: evaluar migrar a TimescaleDB (es una extensión de Postgres, el salto es bajo).

### 1.3 Resiliencia — Circuit Breaker

- **No confundir con try/catch.** Try/catch captura errores puntuales; el circuit breaker mantiene *estado* entre llamadas (cerrado → abierto → semi-abierto) para evitar que un servicio caído sature de reintentos a quien lo llama.
- Aplicarlo entre el backend principal y el servicio del agente de IA (los dos servicios lógicos más claros del sistema).
- Librería según stack: `Polly` (.NET) u `opossum` (Node/TS).
- No es necesario separar en microservicios contenerizados distintos si el tiempo no alcanza — puede demostrarse con dos servicios lógicos corriendo en el mismo `docker-compose`, mientras el patrón esté correctamente implementado.

### 1.4 Agente operativo de IA — CERRADO

- Objetivo: recibir pregunta en lenguaje natural ("¿qué vehículos llevan detenidos más de 20 min en zonas críticas?") → traducirla a consulta real contra los datos → responder en texto.
- **Decisión:** no reutilizar la arquitectura de Botify (plataforma propia del autor, multi-cliente, con entrenamiento sobre documentación, integraciones externas y soporte de modelos locales/generales). Esa complejidad no aporta valor al alcance de esta prueba.
- **Implementación para esta prueba:** un servicio independiente y minimalista, aislado del resto del ecosistema Botify.
  - Function calling / tool use (LangChain o SDK de Anthropic/OpenAI directo) que exponga una función tipo `getVehiculosDetenidos(minutos, zona)` contra la base de datos.
  - El modelo decide cuándo invocar la función según la pregunta recibida.
  - Sin multi-tenant, sin entrenamiento sobre documentos, sin integraciones externas.
- **Nota para la auditoría de IA (README):** este es un buen ejemplo de decisión senior a documentar — "consideré reutilizar la arquitectura de mi propia plataforma (Botify), pero decidí construir un agente aislado y minimalista porque la complejidad multi-cliente no aporta valor al alcance de esta prueba."

### 1.5 Dashboard reactivo

- SPA con mapa en vivo vía WebSockets (conexión persistente) en lugar de polling.
- Cuando el worker persiste un evento válido, emite también un mensaje al canal de WebSocket para actualizar el mapa sin refresco manual.
- Chat con el agente de IA integrado en la misma vista.

### 1.6 App móvil — offline-first

- Cada coordenada capturada se guarda localmente (SQLite / WatermelonDB) con un flag `synced: false` y un `id` único por evento (para idempotencia).
- Al detectar conexión, un sincronizador manda en lote los eventos pendientes y los marca `synced: true`.
- Manejar el caso de fallo parcial de un lote (reintento sin duplicar, usando el id único como clave de idempotencia en el backend).

### 1.7 CI/CD móvil

- **GitHub Actions** (no Jenkins — Jenkins requiere infraestructura propia y no aporta valor aquí; se documenta el conocimiento pero no se implementa).
- Workflow mínimo: en cada push → instalar dependencias → correr tests → build.
- Fastlane se documenta como la herramienta de firmado/publicación a stores, sin necesidad de publicar realmente en App Store/Play Store.

### 1.8 Caos y carga

- **k6** (no JMeter) — más rápido de escribir, JS, mejor integración con CI.
- Script que simule ~300 vehículos enviando POST periódicos, con 10% de peticiones duplicadas y 5% de payloads inválidos, para validar que la cola + validación en background + dead-letter funcionan como se espera.

### 1.9 Infraestructura

- `docker-compose.yml` con: RabbitMQ, Postgres, backend, frontend (y worker si está separado del backend).
- IaC (Terraform/CDK) se incluye como código de referencia en el repo, **documentado pero no necesariamente desplegado** en AWS real — se explica en el README como diseño de infraestructura pensado para producción.

---

## 2. Priorización si el tiempo aprieta

| Prioridad | Componente | Nivel de esfuerzo |
|---|---|---|
| Alta | Pipeline de ingesta (API async + RabbitMQ + worker + validación + persistencia) | Implementación completa |
| Alta | Circuit breaker entre servicios | Implementación completa |
| Alta | Agente de IA con function calling real | Implementación completa |
| Media | Dashboard con WebSockets + mapa en vivo | Implementación completa si alcanza |
| Media | App móvil offline-first | Implementación del flujo core (guardar local + sincronizar), UI mínima |
| Baja | CI/CD completo con Fastlane funcional | Workflow definido, Fastlane documentado |
| Baja | k6 con escenario de caos completo | Script básico funcional |
| Baja | IaC (Terraform/CDK) desplegado en AWS real | Solo código de referencia + justificación en README |

---

## 3. Entregables obligatorios (no negociables)

1. Repositorio público con historial de commits estructurado (no un solo commit gigante).
2. `README.md` con instrucciones de ejecución (`docker-compose up` idealmente) e IaC documentado.
3. **Auditoría de IA** en el README: mínimo 2 decisiones concretas donde el IDE agéntico propuso algo deficiente/inseguro/no escalable, y cómo se corrigió con criterio propio. (Documentar esto en tiempo real mientras se trabaja con Claude Code, no reconstruirlo después de memoria.)
4. Video de sustentación (5-10 min, YouTube no listado): arquitectura + demo funcional + 2 min mostrando el setup del entorno agéntico (reglas de contexto, prompts usados).

---

## 4. Plantilla de mensaje al reclutador (plazo)

> "Gracias por la prueba, me parece un ejercicio interesante y completo. Antes de empezar quiero confirmar el plazo real de entrega (fecha límite), ya que dado el alcance (ingesta de eventos, agente de IA, dashboard reactivo, app móvil offline-first, IaC, testing de carga) probablemente necesite más de las 8-12 horas estimadas para entregar algo de calidad senior, incluso apoyándome en herramientas agénticas. ¿Hay flexibilidad en la fecha, o prefieren que priorice algunos componentes sobre otros dentro del tiempo disponible?"

---

## 5. Notas para Claude Code

- Seguir las decisiones de stack ya fijadas en este documento; no reintroducir Kafka, TimescaleDB, Jenkins ni JMeter salvo que se indique explícitamente lo contrario.
- Cada simplificación de alcance debe generar una línea correspondiente en el README bajo una sección "Decisiones y simplificaciones conscientes".
- Registrar en un archivo aparte (`ai-audit-notes.md`, borrador de trabajo) cualquier sugerencia del agente que se haya rechazado o refactorizado, con motivo — insumo directo para el punto 3 de entregables.

Fin
