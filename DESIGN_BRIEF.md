# Brief de Diseño — Portal de Monitoreo de Flotas (Simón Movilidad)

Este documento es el insumo completo para generar los mockups de pantalla del dashboard web (despachador) y la app móvil (conductor). Contiene el sistema de diseño (tokens exactos, ya implementados en código) y las historias de usuario por pantalla. No se necesita ningún otro archivo del repositorio para diseñar a partir de este brief.

---

## 1. Dirección de diseño

**Producto:** instrumentación de flota / conducción — no un dashboard SaaS genérico. Referencia visual: tableros de instrumentos de vehículos, seguimiento GPS en vivo, centros de control nocturnos.

**Modo por defecto: oscuro.** Es la herramienta operativa real — un despachador monitoreando de noche, o un conductor con la app encendida dentro del vehículo. El modo claro es secundario, para uso de oficina en horario diurno. Todas las pantallas deben diseñarse primero en oscuro; el claro es una variante, no al revés.

**Elemento de firma de la marca — "el pulso":** un anillo que irradia hacia afuera desde el indicador de un vehículo cuando está en movimiento (GPS activo). Duración del pulso: 2000ms en color `moving` (normal), 900ms en color `critical` (más rápido, más urgente). Un vehículo detenido NO pulsa — su indicador queda estático en color `stopped`. Este es el único elemento animado/distintivo de la marca; no inventar otros motivos decorativos.

---

## 2. Sistema de tokens (ya implementado en código — usar EXACTAMENTE estos valores)

### 2.1 Color — semántica de estado (igual en ambos temas, cambia el matiz)

| Token | Significado | Uso |
|---|---|---|
| `moving` | Vehículo en movimiento, GPS activo | Indicador con pulso, texto de estado "en vivo" |
| `stopped` | Vehículo detenido (posible alerta si supera umbral de tiempo) | Indicador estático, etiquetas de alerta media |
| `critical` | Alerta activa / vehículo detenido en zona crítica | Indicador con pulso rápido, alertas urgentes, estado "desconectado" |
| `info` | Mensajes neutros del sistema / respuestas del agente de IA | Burbujas de chat, mensajes informativos |

### 2.2 Color — modo oscuro (default)

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#0B0F14` | Fondo de página |
| `surface` | `#12181F` | Tarjetas, paneles |
| `surfaceRaised` | `#1A222B` | Elementos dentro de una tarjeta (filas de lista, inputs) |
| `border` | `#232D38` | Bordes y separadores |
| `textPrimary` | `#E6EAEF` | Texto principal |
| `textSecondary` | `#8B98A5` | Texto secundario, labels |
| `textMuted` | `#5B6773` | Texto deshabilitado / placeholder |
| `moving` | `#2DD4BF` | Ver semántica arriba |
| `movingSubtle` | `#0F3D38` | Fondo tenue para elementos en estado "moving" |
| `stopped` | `#F5A524` | Ver semántica arriba |
| `stoppedSubtle` | `#4A3510` | Fondo tenue para elementos en estado "stopped" |
| `critical` | `#EF4444` | Ver semántica arriba |
| `criticalSubtle` | `#3D1414` | Fondo tenue para elementos en estado "critical" |
| `info` | `#60A5FA` | Ver semántica arriba |
| `infoSubtle` | `#132A4A` | Fondo tenue para elementos en estado "info" |

### 2.3 Color — modo claro

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#F7F8FA` | Fondo de página |
| `surface` | `#FFFFFF` | Tarjetas, paneles |
| `surfaceRaised` | `#F0F2F5` | Elementos dentro de una tarjeta |
| `border` | `#E2E6EA` | Bordes y separadores |
| `textPrimary` | `#12181F` | Texto principal |
| `textSecondary` | `#5B6773` | Texto secundario, labels |
| `textMuted` | `#8B98A5` | Texto deshabilitado / placeholder |
| `moving` | `#0F9488` | Ver semántica arriba |
| `movingSubtle` | `#DDF5F1` | Fondo tenue para elementos en estado "moving" |
| `stopped` | `#B45309` | Ver semántica arriba |
| `stoppedSubtle` | `#FDF0DD` | Fondo tenue para elementos en estado "stopped" |
| `critical` | `#DC2626` | Ver semántica arriba |
| `criticalSubtle` | `#FCE8E8` | Fondo tenue para elementos en estado "critical" |
| `info` | `#2563EB` | Ver semántica arriba |
| `infoSubtle` | `#E3EDFC` | Fondo tenue para elementos en estado "info" |

### 2.4 Tipografía

| Rol | Fuente | Uso |
|---|---|---|
| Display | Space Grotesk | Headers, números grandes (velocidad, conteos, KPIs) |
| Body | Inter | Texto de UI general, la más usada en la interfaz |
| Mono | IBM Plex Mono | Coordenadas GPS, IDs de vehículo, timestamps — cualquier dato que deba alinearse en columna |

### 2.5 Espaciado y radios

| Token | Valor |
|---|---|
| `spacing.xs` | 4px |
| `spacing.sm` | 8px |
| `spacing.md` | 16px |
| `spacing.lg` | 24px |
| `spacing.xl` | 32px |
| `radii.sm` | 4px |
| `radii.md` | 8px |
| `radii.lg` | 12px |
| `radii.full` | 9999px (círculos, indicadores de estado) |

**Regla estricta:** ningún mockup debe usar un color, fuente, espaciado o radio fuera de esta lista. Si una pantalla necesita algo que no está aquí, es una señal de que falta un token — indicarlo explícitamente en vez de inventar un valor nuevo.

---

## 3. Historias de usuario por pantalla

### Persona 1: Despachador de flota (Dashboard web)

Usuario de oficina/centro de control. Sesión larga (horas), posiblemente múltiples monitores, necesita escaneo rápido de anomalías más que introspección profunda por vehículo.

---

**DW-01 — Vista general de la flota**
*Como despachador, quiero ver un mapa con todos los vehículos activos y su estado (en movimiento / detenido / en alerta), para detectar anomalías sin revisar vehículo por vehículo.*

- Pantalla: Dashboard principal (mapa + panel de alertas + chat, layout de 3 columnas: mapa grande a la izquierda, alertas y chat apiladas a la derecha).
- Estados de color: `moving` con pulso (vehículo activo), `stopped` sin pulso + etiqueta "detenido" (vehículo parado), `critical` con pulso rápido (detenido en zona crítica).
- Prioridad de mockup: **media** — ya existe una versión funcional en código (lista posicional simple); el mockup debe proponer un mapa real con marcadores geográficos.

**DW-02 — Alertas en tiempo real**
*Como despachador, quiero que las alertas aparezcan automáticamente en un panel lateral apenas ocurren, para reaccionar sin retraso.*

- Pantalla: Panel de alertas (columna derecha del dashboard).
- Estados de color: `info` (mensaje neutro), `stopped` (alerta de detención prolongada), `critical` (alerta de zona crítica).
- Prioridad de mockup: **baja** — ya implementado, mockup opcional de refinamiento visual.

**DW-03 — Consultas a la flota en lenguaje natural**
*Como despachador, quiero escribir una pregunta como "¿qué vehículos llevan detenidos más de 20 minutos en zonas críticas?" y recibir una respuesta directa, sin aprender un lenguaje de consulta.*

- Pantalla: Panel de chat (columna derecha, debajo de alertas).
- Estados: burbuja de usuario vs. burbuja de agente (visualmente distintas, usar `movingSubtle` para el usuario y `surfaceRaised` para el agente), estado de carga ("Consultando..."), estado degradado si el agente no responde (mensaje corto en `textMuted`).
- Prioridad de mockup: **baja** — ya implementado, mockup opcional.

**DW-04 — Detalle de un vehículo específico**
*Como despachador, quiero hacer clic en un vehículo del mapa y ver su historial reciente (últimas posiciones, tiempo detenido, velocidad), para investigar una alerta sin salir del dashboard.*

- Pantalla: Panel de detalle (modal o drawer lateral que se abre sobre el dashboard principal).
- Estados: mismo esquema de color que DW-01; considerar un mini-gráfico de velocidad/tiempo usando `moving`/`stopped` para las secciones del recorrido.
- Prioridad de mockup: **alta** — no existe ninguna referencia visual todavía.

**DW-05 — Alternar tema claro/oscuro**
*Como despachador, quiero poder cambiar el tema visual, para adaptar la pantalla a oficina de día o a un centro de control a oscuras de noche.*

- Pantalla: Toggle en el header del dashboard (esquina superior derecha), junto al indicador de conexión.
- Prioridad de mockup: **baja** — ya implementado.

**DW-06 — Estado de conexión del sistema**
*Como despachador, quiero saber si el dashboard sigue recibiendo datos en vivo o se desconectó, para no confiar en información desactualizada sin darme cuenta.*

- Pantalla: Indicador en el header ("en vivo" / "desconectado").
- Estados de color: `moving` (conectado), `critical` (desconectado).
- Prioridad de mockup: **baja** — ya implementado.

---

### Persona 2: Conductor (App móvil)

Usuario en movimiento, atención dividida (conduciendo), pantalla pequeña, condiciones de luz variables (sol directo, noche). La app debe funcionar offline y con fricción mínima — el conductor no debería necesitar mirarla más de lo estrictamente necesario.

---

**DM-01 — Confirmación de captura de ubicación activa**
*Como conductor, quiero un indicador simple y visible de que la app está registrando mi posición, para confiar en que mi recorrido se documenta sin revisarlo constantemente.*

- Pantalla: Pantalla principal/home (única pantalla persistente durante la conducción — debe ser legible de un vistazo, texto grande, poco contenido).
- Estados de color: `moving` con pulso (GPS activo capturando), `stopped` (app abierta pero sin movimiento detectado — informativo, no es error).
- Prioridad de mockup: **alta** — es la pantalla más usada por el conductor y no tiene referencia visual todavía.

**DM-02 — Indicador de estado offline**
*Como conductor, quiero un indicador claro cuando pierdo conexión, y la confianza de que mis coordenadas capturadas mientras tanto no se pierden, para no preocuparme por la cobertura de red.*

- Pantalla: Banner/indicador persistente en la pantalla principal.
- Estados de color: `info` (offline, capturando localmente — estado normal, no una alerta), `moving` (sincronizado).
- Prioridad de mockup: **alta** — parte de la misma pantalla principal que DM-01.

**DM-03 — Confirmación de sincronización**
*Como conductor, quiero una confirmación visual breve de que mis datos guardados offline se enviaron correctamente al reconectar, para tener certeza de que nada quedó sin reportar.*

- Pantalla: Toast/notificación breve superpuesta, o contador discreto ("3 eventos pendientes" → desaparece al sincronizar).
- Estados de color: `stopped` mientras hay eventos pendientes, `moving` cuando el contador llega a cero.
- Prioridad de mockup: **media**.

**DM-04 — Inicio/fin de turno**
*Como conductor, quiero marcar el inicio y fin de mi turno de manejo, para que la telemetría se asocie correctamente a un recorrido y no se mezcle con trayectos personales.*

- Pantalla: Pantalla principal, botón de estado grande (Iniciar turno / Finalizar turno).
- Estados de color: `moving` (turno activo), `textMuted` (turno inactivo).
- Prioridad de mockup: **media** — no existe referencia visual todavía.

**DM-05 — Resumen de jornada**
*Como conductor, quiero ver cuántas horas llevo activo y cuántos eventos se han sincronizado en mi turno actual, para tener una referencia rápida sin necesitar el dashboard del despachador.*

- Pantalla: Vista secundaria de resumen (tab o pantalla accesible desde la principal).
- Estados: puramente informativo, `info`/`textSecondary`; usar `critical` solo si hay un error de sincronización persistente.
- Prioridad de mockup: **baja**.

---

## 4. Tabla resumen de prioridades

| Pantalla | Plataforma | Prioridad | Nota |
|---|---|---|---|
| Pantalla principal (captura + estado offline) | Mobile | **Alta** | DM-01 + DM-02 combinadas en una sola pantalla |
| Detalle de vehículo | Web | **Alta** | Sin referencia visual aún |
| Inicio/fin de turno | Mobile | Media | |
| Confirmación de sincronización | Mobile | Media | |
| Dashboard principal (mapa + alertas + chat) | Web | Media | Reemplazar mapa-lista por mapa geográfico real |
| Resumen de jornada | Mobile | Baja | |
| Alertas, chat, toggle de tema, estado de conexión | Web | Baja | Ya implementadas, mockup solo si se busca refinamiento |

**Orden sugerido de diseño:** empezar por las dos de prioridad alta (pantalla principal del conductor, detalle de vehículo del despachador) — son las que definen patrones visuales que las demás pantallas van a reutilizar.
