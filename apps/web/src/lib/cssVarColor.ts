/**
 * Leaflet dibuja las rutas (Polyline/CircleMarker) sobre SVG con
 * `pathOptions.color`, que exige un valor de color CSS real — no puede
 * resolver clases de Tailwind como lo hace un `className` en DOM normal.
 * En vez de hardcodear un hex de color aquí (prohibido: la única fuente de
 * verdad de color es packages/shared/src/theme.ts vía las variables CSS de
 * src/index.css), se lee la variable en tiempo de ejecución.
 */
export function cssVarColor(varName: string): string {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") return "transparent";
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value ? `rgb(${value})` : "transparent";
}
