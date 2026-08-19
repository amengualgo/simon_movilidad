/**
 * Fuente única de verdad de diseño — dashboard (web) y app del conductor
 * (mobile) consumen estos mismos tokens, en vez de tener colores/tipografía
 * repetidos y sueltos por pantalla.
 *
 * Dirección de diseño: instrumentación de flota / conducción nocturna, no el
 * dashboard SaaS genérico. El modo oscuro es el modo OPERATIVO por defecto
 * (un despachador monitoreando de noche, o el conductor con la app encendida
 * en el vehículo) — el claro es para oficina/uso diurno.
 *
 * Semántica de color de estado, consistente en toda la plataforma:
 * - "moving" (teal)   -> vehículo en movimiento, GPS activo
 * - "stopped" (amber) -> vehículo detenido (posible alerta si supera umbral)
 * - "critical" (red)  -> alerta activa / vehículo detenido en zona crítica
 * - "info" (blue)     -> mensajes neutros del sistema / agente de IA
 */

export const colorTokens = {
  dark: {
    bg: "#0B0F14",
    surface: "#12181F",
    surfaceRaised: "#1A222B",
    border: "#232D38",
    textPrimary: "#E6EAEF",
    textSecondary: "#8B98A5",
    textMuted: "#5B6773",
    moving: "#2DD4BF",
    movingSubtle: "#0F3D38",
    stopped: "#F5A524",
    stoppedSubtle: "#4A3510",
    critical: "#EF4444",
    criticalSubtle: "#3D1414",
    info: "#60A5FA",
    infoSubtle: "#132A4A",
  },
  light: {
    bg: "#F7F8FA",
    surface: "#FFFFFF",
    surfaceRaised: "#F0F2F5",
    border: "#E2E6EA",
    textPrimary: "#12181F",
    textSecondary: "#5B6773",
    textMuted: "#8B98A5",
    moving: "#0F9488",
    movingSubtle: "#DDF5F1",
    stopped: "#B45309",
    stoppedSubtle: "#FDF0DD",
    critical: "#DC2626",
    criticalSubtle: "#FCE8E8",
    info: "#2563EB",
    infoSubtle: "#E3EDFC",
  },
} as const;

export type ThemeMode = keyof typeof colorTokens;
export type ColorToken = keyof (typeof colorTokens)["dark"];

export const typography = {
  // Display: geométrica, con carácter técnico — headers, números grandes (velocidad, conteos)
  display: '"Space Grotesk", system-ui, sans-serif',
  // Body: legible en UI densa de datos
  body: '"Inter", system-ui, sans-serif',
  // Mono: coordenadas, IDs de vehículo, timestamps — cualquier dato que deba alinearse en columna
  mono: '"IBM Plex Mono", "SF Mono", monospace',
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Elemento de firma de la plataforma: el "pulso" — un anillo que irradia
 * desde el marcador de un vehículo EN MOVIMIENTO en el mapa (dashboard) y
 * desde el indicador de estado de captura GPS activa (app del conductor).
 * Un vehículo detenido no pulsa; uno en alerta crítica pulsa en rojo más rápido.
 * Ver tokens `moving`/`critical` arriba y la animación `pulse-ring` en
 * apps/web/src/index.css.
 */
export const motion = {
  pulseDurationMovingMs: 2000,
  pulseDurationCriticalMs: 900,
} as const;
