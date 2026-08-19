import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // El monorepo hospeda apps/mobile (React 19) junto a apps/web (React 18).
  // npm hoistea @tanstack/react-query a la raíz, donde resuelve contra el
  // React 19 de mobile en vez del React 18 local de este workspace —
  // produce dos copias de React y "Invalid hook call" en tiempo de
  // ejecución. `dedupe` fuerza a Vite/Vitest a resolver siempre la copia
  // más cercana a este proyecto (apps/web/node_modules).
  resolve: { dedupe: ["react", "react-dom"] },
  // Vitest/Vite externalizan por defecto los paquetes de node_modules en el
  // pipeline SSR de test (los cargan con `require` nativo de Node, sin pasar
  // por el resolver de Vite) — eso ignora `dedupe` para sus imports internos
  // de React. `noExternal` fuerza a que @tanstack/react-query sí pase por el
  // resolver de Vite, para que quede la misma copia de React que el resto.
  ssr: { noExternal: ["@tanstack/react-query"] },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    globals: true,
  },
});
