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
// Evita resolver dos copias distintas de React/React Native al buscar
// primero en node_modules del workspace raíz cuando falten localmente.
config.resolver.disableHierarchicalLookup = true;

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
