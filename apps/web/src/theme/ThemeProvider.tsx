import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeMode } from "@fleet/shared";

/**
 * Modo oscuro es el default operativo (despachador de noche / conductor en
 * el vehículo). Se persiste en localStorage y respeta la preferencia del
 * sistema en el primer uso. Todo componente debe leer el tema SOLO a través
 * de este contexto o de las clases Tailwind semánticas (bg-surface,
 * text-primary, etc.) — nunca un color hardcodeado por pantalla.
 */
interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "fleet-theme-mode";

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage puede lanzar en modo privado/incógnito de algunos
    // navegadores (Safari, principalmente) — no debe tumbar el render
    // inicial de toda la app por una preferencia de tema no crítica.
  }
  // Default a oscuro (modo operativo), no a la preferencia del sistema —
  // decisión de producto: este es un dashboard de monitoreo, no una app de consumo.
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Mismo caso: si no se puede persistir, el tema simplemente no
      // sobrevive a un refresh — degradación aceptable, no un fallo crítico.
    }
  }, [mode]);

  function toggle() {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}
