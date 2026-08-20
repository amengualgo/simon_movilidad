# Notas de Auditoría de IA (borrador de trabajo)

Registrar aquí, en tiempo real, cualquier caso donde el IDE agéntico sugiera un
enfoque deficiente/inseguro/no escalable y cómo se corrigió. Esto alimenta
directamente la sección "Auditoría de IA" del README final (entregable
obligatorio #3 del enunciado de la prueba).

---

## Caso 1: Reutilización de la arquitectura de Botify para el agente de IA

**Contexto:** al planear el "Agente Operativo" del punto B del enunciado, se
consideró reutilizar la arquitectura de Botify (plataforma propia del autor:
multi-cliente, entrenamiento sobre documentación, integraciones externas,
soporte de modelos locales/generales).

**Por qué se descartó:** esa complejidad (multi-tenancy, entrenamiento sobre
documentos, integraciones externas) no aporta valor al alcance de esta
prueba, que solo pide responder preguntas puntuales sobre el estado de la
flota. Adoptarla habría sido sobre-ingeniería y habría consumido tiempo que
el ejercicio no tiene.

**Corrección aplicada:** se construyó `apps/ai-agent` como un servicio
aislado y minimalista — un único endpoint `/query`, function calling contra
un puñado de funciones tipadas (`getStoppedVehicles`, `getVehiclesByZone`),
sin estado de sesión, sin multi-tenant, con credenciales de DB que en un
entorno real serían de solo lectura.

---

## Caso 2: Proveedor del LLM para el agente de IA — Ollama local en vez de API cloud

**Contexto:** no se dispone de credenciales de ningún proveedor cloud (Anthropic, OpenAI, etc.) para el servicio `apps/ai-agent`.

**Alternativa evaluada y descartada:** dejar el servicio bloqueado a la espera de una API key, o mockear las respuestas del agente sin LLM real — ambas opciones habrían dejado el punto B del enunciado ("Agente Operativo") sin cumplir de forma honesta.

**Corrección aplicada:** se migró `apps/ai-agent` a **Ollama + Qwen2.5**, corriendo 100% local vía `docker-compose.yml` (el servicio `ollama` descarga el modelo automáticamente en el primer arranque). Qwen2.5 soporta tool calling nativo, así que el patrón de function calling contra `getStoppedVehicles`/`getVehiclesByZone` se mantiene sin cambios de arquitectura — solo cambia el cliente HTTP (`ollama` npm package en vez del SDK de Anthropic) y el formato de definición de tools (OpenAI-compatible). Se documentó explícitamente el trade-off: latencia de inferencia local más alta que un proveedor cloud, lo que obliga a ajustar el `timeout` del circuit breaker (ver `circuit-breaker-patterns`) en vez de reutilizar un valor pensado para una API hospedada.

---

## Caso 3: Strings mágicos duplicados entre archivos — centralizados como constantes tipadas

**Contexto:** al revisar el código generado (desde el celular, sin poder correr el proyecto), se detectaron varios discriminadores de tipo repetidos como strings literales sueltos en múltiples archivos: el tipo de mensaje WebSocket (`"telemetry:update"`/`"telemetry:alert"`) en `packages/shared`, `apps/worker` y `apps/web`; el nombre del proveedor de LLM (`"ollama"`/`"openai"`) en `factory.ts` y en cada clase de proveedor; el `role` de los mensajes de chat (`"user"`/`"assistant"`/`"tool"`) en `agent.ts` y `openai-provider.ts`; y el estado de sincronización offline (`"pending"`/`"syncing"`/`"synced"`) en la app móvil.

**Por qué es un problema:** un typo en cualquiera de esos puntos (ej. escribir `"telemtry:update"` en un solo archivo) no da error de compilación si el discriminador no está centralizado — simplemente el mensaje deja de coincidir en runtime, silenciosamente.

**Corrección aplicada:** se centralizaron todos como constantes `as const` (el equivalente idiomático a un enum en TypeScript, con mejor comportamiento en serialización JSON que un `enum` nativo): `WS_MESSAGE_TYPE` y `ALERT_SEVERITY` en `packages/shared/src/events.ts`, `LLM_PROVIDER_NAME` y `MESSAGE_ROLE` en `apps/ai-agent/src/providers/types.ts`, `SYNC_STATUS` en `apps/mobile/src/offlineStore.ts`, y `CHAT_ROLE` (local, UI-only) en `apps/web/src/components/ChatPanel.tsx`. Todos los usos dispersos se reemplazaron por referencias a estas constantes.


---

## Caso 4: Sistema de diseño único — y su limitación honesta de tooling

**Contexto:** el usuario pidió explícitamente evitar estilos repetidos y sueltos por pantalla, con un theme claro/oscuro único para dashboard y app móvil.

**Decisión tomada:** se creó `packages/shared/src/theme.ts` como fuente única de tokens (color, tipografía, radios, espaciado), consumida por `apps/mobile/src/theme.ts` directamente vía import de TypeScript.

**Limitación encontrada y documentada explícitamente (no ocultada):** Tailwind CSS (usado en `apps/web`) carga su `tailwind.config.js` vía Node sin pasar por el pipeline de build de TypeScript del monorepo, así que no puede importar `theme.ts` en tiempo de configuración sin un paso adicional (loader/build script). En vez de fingir que hay una única fuente de verdad cuando no la hay del todo, se documentó la limitación en el propio `README.md` y en comentarios en ambos archivos (`theme.ts` y `apps/web/src/index.css`): los valores de `index.css` deben mantenerse sincronizados manualmente con `theme.ts` hasta que se automatice con un script de build. Es preferible ser explícito sobre esta grieta que dejarla como un supuesto "single source of truth" que en realidad no lo es.

---

## Caso 5: Auditoría sistemática de manejo de errores — sin catches vacíos ni silencios

**Contexto:** revisión explícita solicitada para descartar errores silenciosos en todo el código generado hasta ese punto.

**Hallazgos (13 puntos corregidos):**
1. `apps/api/src/lib/rabbitmq.ts` — la conexión/canal de amqplib no tenían listeners de `error`/`close`; un fallo asíncrono de la conexión (broker reiniciando) habría tumbado el proceso Node sin pasar por el logger estructurado (comportamiento por defecto de EventEmitter ante un evento `error` sin listener).
2. Mismo gap replicado en `apps/worker/src/consumer.ts`.
3. `apps/api/src/lib/ws-broadcast.ts` — el callback de consumo tenía `try/finally` **sin `catch`**: un mensaje malformado en el exchange de broadcast habría escapado sin loguearse.
4. `apps/api/src/routes/telemetry.ts` — `publishTelemetryEvent` podía lanzar (backpressure del broker) y nadie lo capturaba; cae al manejador genérico de Fastify (500 sin contexto).
5. `apps/api/src/server.ts` — el registro de plugins/rutas corría en `await`s de nivel superior, fuera del `start().catch(...)`; un fallo ahí es un rechazo de promesa no manejado, no pasa por `app.log`.
6. `apps/ai-agent/src/agent.ts` — sin try/catch en ninguna etapa (llamada al LLM, ejecución de tool, llamada de seguimiento).
7. `apps/ai-agent/src/server.ts` — la ruta `/query` no envolvía `answerFleetQuery`, arriesgando filtrar detalles internos en un 500 genérico.
8. `apps/ai-agent/src/providers/openai-provider.ts` — `JSON.parse` de argumentos de una tool call sin protección; una tool call malformada del modelo tumbaba toda la respuesta.
9. `apps/web/src/hooks/useFleetSocket.ts` — `JSON.parse` de mensajes de WebSocket sin protección; un mensaje malformado habría roto el handler `onmessage` en silencio (sin logging visible en producción).
10. `apps/web/src/components/ChatPanel.tsx` — no se verificaba `res.ok` antes de leer `data.answer`, arriesgando renderizar "undefined" ante un 400/500 del backend.
11. `apps/web/src/theme/ThemeProvider.tsx` — acceso a `localStorage` sin protección; lanza en modo privado de Safari y similares, tumbando el render inicial por una preferencia no crítica.
12. `apps/mobile/src/syncWorker.ts` — `catch {}` completamente vacío, sin ningún log; un fallo de sync persistente (ej. URL mal configurada) habría sido invisible indefinidamente, aunque el comportamiento de reintento en sí era correcto.
13. `apps/mobile/src/offlineStore.ts` — `captureLocation` no protegía la escritura local; un fallo del driver de storage se habría perdido en silencio, justo en la ruta más crítica del sistema offline-first.

**Principio aplicado en las correcciones:** ningún fix cambia el comportamiento observable "feliz" — todos añaden logging/relanzamiento donde antes había silencio, o distinguen la etapa del fallo para que el log sea diagnosticable (ej. `agent.ts` ahora indica si falló la llamada al LLM o la ejecución de la tool). Se agregaron tests negativos nuevos para los casos de `apps/api` (503 en fallo de publish) y `apps/mobile` (rechazo cuando falla la escritura local) — ver `apps/api/src/__tests__/telemetry.test.ts` y `apps/mobile/src/__tests__/offline-sync.test.ts`.

---

## Caso 6: `npm install --legacy-peer-deps` como parche en vez de arreglar el conflicto real

**Contexto:** al inicializar el scaffold de Expo en `apps/mobile` (React 19), el monorepo pasó a tener React 18 (`apps/web`) y React 19 (`apps/mobile`) conviviendo. Al regenerar `package-lock.json`, `npm install` falló con un `ERESOLVE` real: `@vitejs/plugin-react@^4.3.2` (devDependency de `apps/web`) declara un rango de peer `vite` que no incluye `vite@^8.2.1` (ya usado en el repo).

**Enfoque deficiente considerado primero:** la salida más rápida era `npm install --legacy-peer-deps`, que efectivamente instaló todo — pero al inspeccionar el árbol resultante (`npm ls react react-dom`), ese flag hizo que npm hoisteara `react-dom@18.3.1` al `node_modules` raíz sin verificar que su peer `react` real ahí también fuera 18.x (el raíz ya tenía `react@19.2.3` hoisteado por `apps/mobile`). Resultado: dos copias de React coexistiendo de forma inconsistente, y los tests de `apps/web` (`AlertsPanel`, `ChatPanel`, etc.) empezaron a fallar con `Cannot read properties of undefined (reading 'ReactCurrentDispatcher')` — el síntoma clásico de "dual React copy". `--legacy-peer-deps` no arregló el conflicto, solo lo ocultó y generó uno nuevo, silencioso, en otro lugar.

**Corrección aplicada:** se identificó la causa raíz real (el rango de peer de `@vitejs/plugin-react@4.x` no cubre `vite@8`, y `@vitejs/plugin-react@^6.0.5` sí lo declara explícitamente) y se bumpeó esa única dependencia en `apps/web/package.json`. Con eso, `npm install` (sin ningún flag) resolvió el árbol completo de forma consistente — cada workspace terminó con su propia copia de `react`/`react-dom` correctamente anidada, sin conflicto. Se verificó corriendo la suite completa de los 5 workspaces (`shared`, `mobile`, `web`, `api`, `worker`) tras el fix, no solo el paquete que se estaba tocando.

---

## Caso 7: Reescribir código ya probado para esquivar una limitación del bundler, en vez de arreglar el bundler

**Contexto:** al verificar que `apps/mobile` empaqueta con Metro real (`expo export`), el build falló porque `offlineStore.ts`/`syncWorker.ts` usan imports relativos con extensión `.js` apuntando a archivos `.ts` (estilo NodeNext/ESM, ya validado por TypeScript y por Vitest).

**Enfoque deficiente considerado:** la opción más rápida era reescribir esos imports quitándoles la extensión `.js` en los dos archivos ya probados — habría "arreglado" el build de Metro en segundos, pero violaba la instrucción explícita de reutilizar `offlineStore.ts`/`syncWorker.ts` tal cual, y habría dejado esos archivos inconsistentes con el resto del monorepo (que sí usa el estilo NodeNext con extensión `.js`).

**Corrección aplicada:** se resolvió en la capa correcta — un `resolveRequest` personalizado en `apps/mobile/metro.config.js` que reintenta la resolución probando `.ts`/`.tsx` cuando un import relativo `.js` no tiene archivo `.js` real. El código fuente (ya probado, ya revisado) no se tocó; el bundler es el que se ajustó a una convención de TypeScript válida y ya establecida en el resto del repo. Verificado con `expo export --platform android` (642 módulos resueltos sin errores).

---

## Caso 8: Mapa de flota — el propio mockup sugería una imagen estática, se corrigió a un mapa real

**Contexto:** el mockup importado (`Mockups Portal Flotas.dc.html`, vía Claude Design) resuelve el mapa del dashboard (DW-01) y el mini-mapa de recorrido del drawer de vehículo (DW-04) con una imagen PNG estática de Bogotá (`assets/map-bogota-wide.png`) y marcadores dibujados en **posiciones de píxel fijas, hardcodeadas a mano** sobre esa imagen — una conveniencia razonable para una herramienta de diseño, pero que no representa coordenadas geográficas reales de ningún vehículo.

**Por qué es deficiente si se implementa tal cual:** una posición de píxel fija no tiene relación con el `lat`/`lng` real que manda la telemetría — el mapa se vería bien en la captura de pantalla pero sería una fachada, no un mapa funcional. Además el propio `FleetMap.tsx` (código ya existente antes de este mockup) dejaba un comentario explícito señalando que el reemplazo real del placeholder de lista era "Leaflet/Mapbox real", así que copiar la imagen estática del mockup habría sido un paso atrás respecto a la dirección ya declarada del proyecto.

**Corrección aplicada (confirmada con el usuario antes de implementar, ver `AskUserQuestion` en la sesión):** se integró `react-leaflet` + tiles de OpenStreetMap, proyectando el `lat`/`lng` real de cada vehículo (`VehicleStatusUpdate`) sobre un mapa real centrado en Bogotá, tanto en el mapa principal (`FleetMap.tsx`) como en el mini-mapa de recorrido del drawer (`VehicleDetailDrawer.tsx`, usando las posiciones reales devueltas por el nuevo endpoint `GET /vehicles/:id/history`). Se conservó del mockup únicamente el lenguaje visual (color por estado, anillo de pulso solo en `moving`/`critical`, leyenda) — no su mecanismo de posicionamiento.

---

## Caso 9: Rate limit global sobre toda la API, en vez de aplicado solo donde corresponde

**Contexto:** `apps/api/src/server.ts` registraba `@fastify/rate-limit` de forma global (`{ max: 100, timeWindow: "1 minute" }`), sin `global: false` ni scoping por ruta, cubriendo por igual `/telemetry`, `/telemetry/batch`, `/chat`, `/vehicles/*` y el WebSocket.

**Por qué es no escalable:** al correr `k6/load-test.js` (~300 vehículos simulados, ~250 req/s agregadas desde una sola IP) contra el stack real, el 99.32% de las peticiones a `/telemetry` volvieron `429 Too Many Requests`. Un límite de 100 req/min por IP es incompatible con un endpoint de ingesta de flota, y contradice directamente la decisión de arquitectura ya cerrada en CLAUDE.md/PLAN.md: ingesta asíncrona de alto volumen vía RabbitMQ con `202` inmediato, cuyo backpressure real debe venir del prefetch del worker, no de un rate limiter genérico puesto sobre toda la app.

**Corrección aplicada:** `rateLimit` pasó a registrarse con `global: false`; solo `POST /chat` (el endpoint que dispara al agente de IA vía circuit breaker) activa un límite propio y bajo (20 req/min) en su config de ruta, ahí sí tiene sentido, protege un recurso costoso (LLM) de abuso. `/telemetry` y `/telemetry/batch` quedan sin límite artificial. Detectado empíricamente con el propio load test del proyecto (no por inspección de código), corregido y pendiente de re-verificar re-corriendo `k6/load-test.js`.

---

## Caso 10: Timeout de circuit breaker copiado del ejemplo genérico de la skill, ignorando la advertencia explícita de la skill del agente de IA

**Contexto:** `apps/api/src/lib/circuit-breaker.ts` envuelve la llamada `api → ai-agent` con `opossum`, configurado con `timeout: 5000` (y el mismo valor en `AbortSignal.timeout(5000)` del fetch interno) — exactamente el valor del ejemplo de código en `.claude/skills/circuit-breaker-patterns/SKILL.md`, copiado literal.

**Por qué es deficiente:** la skill `ai-agent-patterns` (del mismo repo, referenciada explícitamente en un comentario de `ollama-provider.ts`) advierte en su propio texto: *"Local inference is slower than a hosted API — budget for that in the circuit breaker's timeout... don't reuse a timeout tuned for a cloud provider."* El código de `circuit-breaker.ts` no siguió esa advertencia — usó el `timeout: 5000` del ejemplo genérico de `circuit-breaker-patterns` (razonable para una llamada HTTP típica a un servicio en la nube) sin ajustarlo al hecho de que `ai-agent` corre inferencia local en CPU. Resultado: el chat del dashboard caía al fallback ("Agente no disponible") en el 100% de las consultas reales, incluso con el modelo correcto y Ollama funcionando bien — el breaker abría antes de que el LLM alcanzara siquiera a responder.

**Corrección aplicada:** medido contra el `ollama` real del proyecto (no estimado): una sola llamada de `qwen2.5:3b` en CPU tardó 62.5s (`prompt eval` + `eval` de ~600 tokens totales, ~6.6 tok/s). `agent.ts` hace 2 llamadas secuenciales al LLM por consulta con tool calling (una para decidir la tool, otra para sintetizar la respuesta final), así que el timeout se subió a 120s con margen documentado en un comentario junto a la constante, referenciando este caso.

---

## Caso 11: WatermelonDB ya instalado — se descartó igual por no ser verificable en este entorno

**Contexto:** al planear el reemplazo del `LocalStore` en memoria de `apps/mobile` (gap ya documentado desde el pase de inicialización de Expo), `@nozbe/watermelondb@^0.25.5` ya figuraba como dependencia instalada en `package.json` — la opción "de menor fricción aparente" era simplemente cablearla, ya que parecía una decisión previa tomada.

**Por qué se evaluó como deficiente para este caso puntual:** WatermelonDB estaba instalado pero completamente sin cablear (sin schema, sin `Model`/`Database`, sin `babel.config.js` para sus decoradores). Su adaptador SQLite típicamente requiere `expo prebuild` + linking nativo para funcionar en un build real — y este entorno de generación no tiene Xcode ni Android SDK para siquiera intentar ese build, mucho menos verificarlo. Cablearla igual habría producido código que "compila" pero termina en el mismo gap ya documentado para otras piezas de `apps/mobile` (código nunca probado contra un dispositivo/emulador real), sin ganar nada a cambio frente a la alternativa.

**Corrección aplicada (confirmada con el usuario antes de implementar, vía `AskUserQuestion`):** se usó `expo-sqlite` en su lugar — módulo oficial de Expo, funciona en managed workflow sin `prebuild`, cero configuración nativa adicional (`npx expo install expo-sqlite` incluso agregó su plugin a `app.json` automáticamente). Se sacó `@nozbe/watermelondb` de `package.json` en vez de dejarlo como dependencia sin uso. Se verificó lo que sí es verificable en este entorno sin dispositivo (`tsc --noEmit`, `vitest` contra un `SqliteDriver` falso inyectado, `expo export --platform android` con 675 módulos bundleados) y se documentó explícitamente, en `apps/mobile/README.md`, qué sigue sin poder probarse sin hardware real (persistencia SQL real entre reinicios, compatibilidad con Expo Go para SDK 57).

---

## Caso 12: `disableHierarchicalLookup: true` en Metro — rompía en CI limpio, funcionaba "por suerte" en local

**Contexto:** el workflow `Mobile CI` de GitHub Actions falló dos veces seguidas con `Unable to resolve module scheduler` durante `expo export --platform android`, pese a que el mismo comando funcionaba sin problema en el entorno local del autor.

**Causa raíz identificada:** `apps/mobile/metro.config.js` tenía `config.resolver.disableHierarchicalLookup = true`, con la intención documentada de evitar que Metro resolviera dos copias distintas de React/React Native. El efecto real de esa opción es más agresivo: le impide a Metro caminar hacia arriba por el árbol de `node_modules` buscando un paquete que no esté exactamente en las rutas listadas en `nodeModulesPaths`. Con React 18 (web) y React 19 (mobile) conviviendo en el mismo monorepo, npm resolvió `scheduler` (dependencia interna de `react-native@0.86.2`, que requiere exactamente `scheduler@0.27.0`) en una ubicación anidada fuera de esas dos rutas permitidas — funcionaba en local por una resolución de `node_modules` distinta (más antigua/con otro orden de instalación), pero una instalación 100% limpia en CI (determinística según el lockfile) expuso el problema real.

**Por qué es un ejemplo relevante de auditoría de IA:** el comentario original junto a la línea sonaba razonable ("evita resolver dos copias de React"), pero no reflejaba el comportamiento real documentado de la opción, y nunca se verificó contra una instalación limpia — solo contra el entorno local ya "contaminado" por instalaciones previas. Es el mismo patrón que otros casos de esta lista: código que parece razonable y hasta compila/corre localmente, pero no sobrevive una verificación real desde cero.

**Corrección aplicada:** se quitó `disableHierarchicalLookup` (Metro vuelve a su comportamiento por defecto, con el walk-up habilitado), y se agregó `scheduler` como dependencia directa de `apps/mobile/package.json`, fijada en `0.27.0` — la versión exacta que `react-native@0.86.2` declara como su propia dependencia (verificado contra el registro de npm, no adivinado), para que quede hoisteada de forma consistente sin importar el conflicto de versiones de React entre workspaces. Pendiente: confirmar en GitHub Actions que el workflow `Mobile CI` queda en verde tras este fix.
