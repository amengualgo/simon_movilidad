/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Todos los colores se resuelven vía variables CSS (ver src/index.css),
      // que a su vez están generadas a partir de packages/shared/src/theme.ts.
      // NINGÚN componente debe usar un hex literal — solo estas clases semánticas.
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        "text-primary": "rgb(var(--color-text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--color-text-secondary) / <alpha-value>)",
        "text-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
        moving: "rgb(var(--color-moving) / <alpha-value>)",
        "moving-subtle": "rgb(var(--color-moving-subtle) / <alpha-value>)",
        stopped: "rgb(var(--color-stopped) / <alpha-value>)",
        "stopped-subtle": "rgb(var(--color-stopped-subtle) / <alpha-value>)",
        critical: "rgb(var(--color-critical) / <alpha-value>)",
        "critical-subtle": "rgb(var(--color-critical-subtle) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)",
        "info-subtle": "rgb(var(--color-info-subtle) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "SF Mono", "monospace"],
      },
      animation: {
        "pulse-ring-moving": "pulse-ring 2s ease-out infinite",
        "pulse-ring-critical": "pulse-ring 0.9s ease-out infinite",
      },
    },
  },
  plugins: [],
};
