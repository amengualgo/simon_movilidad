// Config de Metro para monorepo (npm workspaces) — ver
// https://docs.expo.dev/guides/monorepos/. Necesario para que Metro
// resuelva "@fleet/shared" (symlink de npm workspaces hacia
// packages/shared) y los node_modules hoisteados en la raíz del repo,
// que de otro modo Metro no ve por estar fuera de apps/mobile.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// NOTA (corregido tras fallo real en CI, ver tasks/ai-audit-notes.md): NO se
// deshabilita disableHierarchicalLookup. Esa opción le impide a Metro
// caminar hacia arriba por el árbol de node_modules buscando un paquete que
// no esté exactamente en nodeModulesPaths — con React 18 (web) y React 19
// (mobile) conviviendo en el monorepo, npm a veces anida una copia de un
// paquete transitivo (ej. "scheduler") en una ruta que disableHierarchicalLookup
// no cubre, y Metro deja de poder encontrarlo. Falló en una instalación
// limpia de CI (funcionaba en local por una resolución de node_modules
// distinta/más vieja) con: "Unable to resolve module scheduler". Se deja el
// comportamiento por defecto de Metro (walk-up habilitado) y en su lugar se
// fuerza "scheduler" como dependencia directa de este workspace (ver
// package.json) para que npm lo hoistee de forma consistente sin importar
// el conflicto de versiones de React entre workspaces.

// offlineStore.ts/syncWorker.ts (y el resto del código compartido con
// Vitest) usan imports relativos con extensión ".js" apuntando a archivos
// ".ts" — es el estilo NodeNext/ESM estándar que TypeScript exige para ese
// moduleResolution, y con el que Vitest ya sabe lidiar de forma nativa. A
// diferencia de Vite, Metro NO reescribe ".js" -> ".ts" por defecto para
// imports relativos, así que sin este resolver una app Expo real fallaría
// al empaquetar ese código ya existente. Mantenemos el código fuente tal
// cual (no se reescriben los imports) y resolvemos aquí, en el bundler.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    for (const ext of [".ts", ".tsx"]) {
      try {
        return context.resolveRequest(context, moduleName.replace(/\.js$/, ext), platform);
      } catch {
        // Sin equivalente con esta extensión: se prueba la siguiente, y si
        // ninguna existe se cae al flujo normal de resolución de Metro.
      }
    }
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
