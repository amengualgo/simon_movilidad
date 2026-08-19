# Historias de Usuario — Portal de Monitoreo de Flotas

Este documento es el insumo de referencia para diseñar mockups de pantallas
(dashboard web + app del conductor). Úsalo junto con:

- **Sistema de diseño**: `packages/shared/src/theme.ts` (tokens de color modo
  claro/oscuro, tipografía, radios, espaciado) y `apps/web/src/index.css`
  (variables CSS ya resueltas para el dashboard).
- **Elemento de firma**: el "pulso" — un anillo que irradia desde el
  indicador de un vehículo en movimiento (teal) o en alerta crítica (rojo,
  pulso más rápido). Un vehículo detenido no pulsa. Ver `motion` en `theme.ts`.
- **Modo por defecto**: oscuro, en ambas plataformas — es la herramienta
  operativa de un despachador de noche o un conductor con la app encendida en
  el vehículo. El modo claro es secundario, para uso de oficina/diurno.

Cada historia sigue el formato `Como <persona>, quiero <acción>, para
<objetivo>`, con las pantallas que implica y las notas de estado (qué se ve
en cada color semántico: `moving` / `stopped` / `critical` / `info`).

---

## Persona 1: Despachador de flota (Dashboard web)

Usuario de oficina/centro de control. Sesión larga (horas), múltiples
monitores posibles, necesita escaneo rápido de anomalías más que introspección
profunda por vehículo.

### DW-01 — Ver el estado general de la flota de un vistazo
Como despachador, quiero ver un mapa con todos los vehículos activos y su
estado (en movimiento / detenido / en alerta), para detectar anomalías sin
tener que revisar vehículo por vehículo.

- **Pantalla**: Dashboard principal (mapa + panel de alertas + chat).
- **Estados de color**: `moving` (pulso teal), `stopped` (ámbar, sin pulso),
  `critical` (rojo, pulso rápido) para vehículos detenidos en zona crítica.
- **Ya prototipado en código**: `apps/web/src/App.tsx`, `FleetMap.tsx`.

### DW-02 — Recibir alertas en tiempo real sin recargar la página
Como despachador, quiero que las alertas aparezcan automáticamente en un
panel lateral apenas ocurren, para reaccionar sin retraso.

- **Pantalla**: Panel de alertas (parte del dashboard principal).
- **Estados de color**: `info` (mensajes neutros), `stopped`/ámbar (alerta de
  detención prolongada), `critical`/rojo (alerta de zona crítica).
- **Ya prototipado en código**: `AlertsPanel.tsx`.

### DW-03 — Preguntarle a la flota en lenguaje natural
Como despachador, quiero escribir una pregunta como "¿qué vehículos llevan
detenidos más de 20 minutos en zonas críticas?" y recibir una respuesta
directa, para no tener que aprender un lenguaje de consulta ni pedirle el
dato a otra persona.

- **Pantalla**: Panel de chat (parte del dashboard principal, columna lateral).
- **Estados**: burbuja de usuario vs. burbuja de agente (visualmente
  distintas), estado de carga ("Consultando..."), estado degradado si el
  agente no responde (mensaje de fallback del circuit breaker).
- **Ya prototipado en código**: `ChatPanel.tsx`.

### DW-04 — Ver el detalle de un vehículo específico
Como despachador, quiero hacer clic/tap en un vehículo del mapa y ver su
historial reciente (últimas posiciones, tiempo detenido, velocidad), para
investigar una alerta puntual sin salir del dashboard.

- **Pantalla**: Panel de detalle de vehículo (modal o drawer lateral —
  **pendiente de mockup**, no implementado aún en el código base).
- **Estados**: mismo esquema de color que DW-01, más un mini-gráfico de
  velocidad/tiempo si el diseño lo justifica.

### DW-05 — Cambiar entre tema claro y oscuro
Como despachador, quiero poder alternar el tema visual, para adaptar la
pantalla a condiciones de oficina de día o a un centro de control a oscuras
de noche.

- **Pantalla**: Toggle en el header del dashboard (esquina superior derecha).
- **Ya prototipado en código**: `ThemeToggle.tsx`, `ThemeProvider.tsx`.

### DW-06 — Ver el estado de conexión del sistema
Como despachador, quiero saber si el dashboard sigue recibiendo datos en
vivo o se desconectó, para no confiar en información que dejó de
actualizarse sin darme cuenta.

- **Pantalla**: Indicador de estado en el header ("en vivo" / "desconectado").
- **Estados de color**: `moving`/teal (conectado), `critical`/rojo
  (desconectado).
- **Ya prototipado en código**: `App.tsx` (badge de estado).

---

## Persona 2: Conductor (App móvil)

Usuario en movimiento, atención dividida (está conduciendo), pantalla
pequeña, condiciones de luz variables (sol directo, de noche). La app debe
funcionar sin conexión y sin fricción — el conductor no debería tener que
mirarla más de lo estrictamente necesario.

### DM-01 — Ver que la app está capturando mi ubicación
Como conductor, quiero un indicador simple y visible de que la app está
registrando mi posición, para confiar en que mi recorrido se está
documentando sin tener que revisar constantemente.

- **Pantalla**: Pantalla principal/home de la app (única pantalla persistente
  durante la conducción).
- **Estados de color**: `moving`/teal con pulso (GPS activo capturando),
  `stopped`/ámbar (app abierta pero sin movimiento detectado — no es un
  error, es informativo).
- **Base de lógica ya escrita**: `apps/mobile/src/offlineStore.ts`
  (`captureLocation`).

### DM-02 — Saber si estoy offline y que mis datos no se van a perder
Como conductor, quiero un indicador claro cuando pierdo conexión, y la
confianza de que mis coordenadas capturadas mientras tanto no se pierden,
para no preocuparme por la cobertura de red en zonas rurales o túneles.

- **Pantalla**: Banner/indicador persistente en la pantalla principal.
- **Estados de color**: `info`/azul (offline, capturando localmente — estado
  normal y esperado, no una alerta), `moving`/teal (sincronizado).
- **Base de lógica ya escrita**: `apps/mobile/src/syncWorker.ts`,
  `SYNC_STATUS` en `offlineStore.ts`.

### DM-03 — Ver que mis datos pendientes se sincronizaron
Como conductor, quiero una confirmación visual (aunque sea breve) de que el
lote de coordenadas guardadas offline se envió correctamente al reconectar,
para tener certeza de que nada quedó sin reportar.

- **Pantalla**: Toast/notificación breve superpuesta a la pantalla principal,
  o un contador discreto ("3 eventos pendientes" → desaparece al sincronizar).
- **Estados de color**: `stopped`/ámbar mientras hay eventos `pending`,
  `moving`/teal cuando el contador llega a cero.

### DM-04 — Iniciar/detener explícitamente el registro de un turno
Como conductor, quiero poder marcar el inicio y fin de mi turno de manejo,
para que la telemetría capturada se asocie correctamente a un recorrido y no
se mezcle con trayectos personales.

- **Pantalla**: Pantalla principal, botón de estado grande (Iniciar
  turno / Finalizar turno) — **pendiente de mockup**, no implementado aún en
  el código base (el scaffold actual asume captura continua).
- **Estados de color**: `moving`/teal (turno activo), neutro/`text-muted`
  (turno inactivo).

### DM-05 — Ver un resumen simple de mi jornada
Como conductor, quiero ver cuántas horas llevo activo y cuántos eventos se
han sincronizado en mi turno actual, para tener una referencia rápida sin
necesitar el dashboard del despachador.

- **Pantalla**: Pantalla secundaria de resumen (tab o vista accesible desde
  la principal) — **pendiente de mockup**, no implementado aún en el código
  base.
- **Estados**: puramente informativo, usa `info`/`text-secondary`, sin
  necesidad de rojo/ámbar salvo que haya un error de sincronización
  persistente.

---

## Resumen para quien genere los mockups

| Pantalla | Plataforma | Estado en código | Prioridad de mockup |
|---|---|---|---|
| Dashboard principal (mapa + alertas + chat) | Web | Implementado (placeholder de mapa) | Media — reemplazar mapa lista por mapa real |
| Detalle de vehículo | Web | No implementado | Alta — no hay referencia visual aún |
| Toggle de tema | Web | Implementado | Baja |
| Pantalla principal (captura + estado offline) | Mobile | Lógica sin UI | Alta — es la pantalla que más usa el conductor |
| Inicio/fin de turno | Mobile | No implementado | Media |
| Resumen de jornada | Mobile | No implementado | Baja |

Todas las pantallas deben usar exclusivamente los tokens de
`packages/shared/src/theme.ts` — ningún mockup debería introducir un color
que no esté ya en esa lista, para que el diseño y el código no se
desincronicen cuando se implemente.
