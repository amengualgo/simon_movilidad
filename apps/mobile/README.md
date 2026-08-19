# App del Conductor — React Native / Expo (offline-first)

## Estado actual

El scaffold de Expo (TypeScript, SDK 57) ya está inicializado en este
directorio y las 5 pantallas del conductor (DM-01 a DM-05) están
implementadas y verificadas con `expo export` (bundling real vía Metro, ver
"Qué se verificó" más abajo). La lógica core de offline-sync
(`src/offlineStore.ts`, `src/syncWorker.ts`) se preservó tal cual estaba —
no se reescribió nada de ella, solo se conectó a UI real.

## Arquitectura de pantallas

- **`App.tsx`** — raíz. Un `useState<"main" | "summary">` decide qué
  pantalla se muestra. **No se usa `react-navigation`**: esta app es en la
  práctica una sola pantalla persistente (conducción) más una secundaria
  (resumen) alcanzable con un botón — traer una librería de navegación para
  eso es sobre-ingeniería para el alcance de esta app. Es una decisión
  deliberada, no una omisión.
- **`src/screens/CaptureScreen.tsx`** (DM-01/DM-02/DM-04) — pantalla
  principal. Dos estados (turno activo / inactivo) controlados por
  `useDriverSession()`.
- **`src/screens/EndShiftSheet.tsx`** (DM-04) — confirmación de fin de
  turno, superpuesta.
- **`src/screens/SummaryScreen.tsx`** (DM-05) — resumen de jornada.
- **`src/components/SyncToast.tsx`** (DM-03) — banner de sync, alimentado
  por el `pendingCount` real de `offlineStore`, no un mock.
- **`src/components/PulseIndicator.tsx`** — el "pulso" de la marca (anillo
  animado con `Animated`, sin librerías externas de animación).
- **`src/hooks/useDriverSession.ts`** — une captura, turno y sync en un solo
  hook que vive en `App.tsx` y se pasa a las pantallas por props.
- **`src/hooks/useGpsWatch.ts`** — wrapper de `expo-location`.
- **`src/lib/localStore.ts`** — implementación en memoria de `LocalStore` (ver gap más abajo).
- **`src/lib/geo.ts`** — Haversine + formato de duración, sin dependencias.

Todo el color/tipografía/espaciado sale de `getTheme()` (`src/theme.ts` →
`@fleet/shared`); ninguna pantalla define un hex o nombre de fuente propio.

## Gaps documentados (explícitos, no silenciosos)

1. **`LocalStore` sigue siendo en memoria, no WatermelonDB/expo-sqlite.**
   `src/lib/localStore.ts` implementa exactamente el contrato que
   `offlineStore.ts`/`syncWorker.ts` ya esperaban (`insert`/`findPending`/`markSynced`),
   más una capa de suscripción (`subscribe`/`getSnapshot`) que la UI usa vía
   `useSyncExternalStore` para reflejar el contador de pendientes sin hacer
   polling. Conectar WatermelonDB (o `expo-sqlite` como alternativa más
   simple) requiere pasos de configuración nativa que van más allá de este
   pase — sustituir `createInMemoryStore()` por el driver real en
   `useDriverSession.ts` es el único punto de cambio necesario, la lógica de
   captura/sync no se toca.
2. **Captura GPS real no verificada contra hardware.** `useGpsWatch.ts` usa
   la API documentada de `expo-location` (`requestForegroundPermissionsAsync`
   + `watchPositionAsync`), pero este entorno de generación no tiene
   Xcode/Android SDK ni un dispositivo/emulador con servicios de ubicación
   disponibles — así que no hay una verificación end-to-end de
   permisos/hardware real. Lo que sí se verificó: que el código compila,
   tipa y **empaqueta** correctamente con Metro (ver abajo), es decir, que
   el import de `expo-location` y su uso son sintácticamente y
   estructuralmente correctos.
3. **No hay build nativo (`ios/`, `android/`) generado.** Se mantiene el
   managed workflow de Expo; `npx expo prebuild` generaría esas carpetas
   si se necesitara código nativo custom, pero no fue necesario aquí.
4. **Fastlane/EAS: documentado, no ejecutado.** Ver sección "CI/CD" abajo.

## Qué se verificó (y cómo)

- `npm run typecheck` (`tsc --noEmit`) — sin errores, sobre el código real de
  las 5 pantallas + hooks + la lógica offline-sync ya existente.
- `npm test` — 14/14 tests pasan (`vitest run`), incluyendo los 7 tests
  originales de `offline-sync.test.ts` (sin tocar) más `geo.test.ts` y
  `localStore.test.ts`, nuevos.
- `npm run build` (`expo export --platform android`) — **empaqueta con
  Metro real** (642 módulos resueltos), sin necesitar Android SDK/Xcode ni
  un dispositivo — esto sí prueba que todo el grafo de imports (incluido el
  workspace `@fleet/shared` vía symlink de npm workspaces) resuelve y
  compila correctamente. Es la verificación más fuerte disponible sin
  hardware real; no reemplaza probar la app corriendo en un
  dispositivo/emulador.

Durante esta verificación con Metro se descubrió que `offlineStore.ts` y
`syncWorker.ts` usan imports relativos con extensión `.js` apuntando a
archivos `.ts` (estilo NodeNext/ESM, correcto para TypeScript y ya
funcionaba con Vitest) — pero **Metro no reescribe `.js` → `.ts` por
defecto**, y sin ajustar el resolver la app fallaba al empaquetar código ya
existente y probado. Se resolvió con un `resolveRequest` custom en
`metro.config.js` (documentado ahí mismo) en vez de reescribir esos archivos
— mantiene la lógica core intacta, como pedía el encargo.

## Decisión de testing: Vitest para lógica pura, no para componentes RN

Se intentó explícitamente renderizar un componente de React Native bajo
Vitest antes de descartar la idea (no fue una suposición). El resultado:

```
RollupError: Parse failure: Expected 'from', got 'typeOf'
  at node_modules/react-native/index.js:27:7
  import typeof * as ReactNativePublicAPI from "...";
```

El propio paquete `react-native` usa sintaxis Flow (`import typeof`) en su
punto de entrada. Metro y Jest (vía `jest-expo`/`babel-preset-expo`) traen
un transform de Babel que la elimina antes de ejecutar; el pipeline de
Vitest (Vite + esbuild/Rollup) no la entiende y no hay una forma de
arreglarlo sin montar un pipeline de transformación equivalente a
`jest-expo` — que es exactamente la fricción "Jest vs. Vitest" que el
encargo pedía evaluar, no forzar.

**Decisión:** Vitest se queda para lo que ya prueba bien — lógica pura sin
importar `react-native` (`offlineStore.ts`, `syncWorker.ts`, `lib/geo.ts`,
`lib/localStore.ts`, 14 tests en total). Las pantallas/componentes RN
(`CaptureScreen`, `SyncToast`, etc.) **no tienen test automatizado en este
pase** — es un gap real, documentado aquí explícitamente en vez de forzar
`jest-expo` dentro de un monorepo que por convención usa Vitest en todos los
demás paquetes, o de fingir una cobertura que no existe.

## Cómo correr la app

```bash
npm install            # desde la raíz del monorepo, o desde apps/mobile
npm run start -w @fleet/mobile   # expo start — requiere Expo Go o un simulador/dispositivo
npm run typecheck -w @fleet/mobile
npm test -w @fleet/mobile
npm run build -w @fleet/mobile   # expo export --platform android (sin SDK nativo)
```

`EXPO_PUBLIC_API_URL` controla a dónde apunta `syncWorker.ts` (por defecto
`http://localhost:3000`, ver `.env.example` en la raíz).

## CI/CD

`.github/workflows/mobile.yml` corre en cada push/PR que toque
`apps/mobile/**`: `npm install` → `npm run typecheck` (stand-in explícito de
"lint" — no hay ESLint configurado a nivel de monorepo todavía, gap fuera
del alcance de este paquete) → `npm test` → `npm run build` (Metro/`expo
export`, sin necesitar macOS/Xcode para esta parte, aunque el runner sigue
siendo `macos-latest` pensando en los pasos de Fastlane/iOS documentados
abajo).

### Fastlane / EAS — diseñado, no ejecutado

`apps/mobile/fastlane/Fastfile` define lanes (`ios build`, `ios beta`,
`android build`, `android beta`) que orquestan `eas build`/`eas submit`
— el flujo estándar para un proyecto Expo managed workflow, donde EAS hace
el build nativo y Fastlane orquesta firma/subida a las tiendas.
`apps/mobile/eas.json` define los perfiles (`preview`, `production`).
**Ninguno de estos lanes se ejecutó contra credenciales reales de tienda**
para esta prueba técnica — las credenciales (App Store Connect API key,
keystore de Android, `EXPO_TOKEN`) se documentan como secrets de CI
esperados, nunca committeados, y el pipeline es intencionalmente
"diseñado pero no ejecutado" en lugar de un intento parcial que no
funcionaría sin cuenta de desarrollador real.

## Contrato de sync (recordatorio)

`syncWorker.ts` envía todos los eventos `pending` en **un solo batch** a
`POST {EXPO_PUBLIC_API_URL}/telemetry/batch`, que alimenta el mismo pipeline
de ingesta por RabbitMQ que usa la API para eventos individuales — no hay
una ruta de ingesta paralela. El `eventId` se genera en el dispositivo
(nunca en el servidor), lo que permite reintentar un batch completo sin
crear duplicados si la respuesta se pierde. Ver skill `mobile-offline-sync`.
