import { useTheme } from "./ThemeProvider.js";

export function ThemeToggle() {
  const { mode, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label={mode === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="rounded border border-border bg-surface-raised px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
    >
      {mode === "dark" ? "☾ oscuro" : "☀ claro"}
    </button>
  );
}
