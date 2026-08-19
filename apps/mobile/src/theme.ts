import { colorTokens, typography, radii, spacing, type ThemeMode } from "@fleet/shared";

/**
 * Theme de la app del conductor — consume los MISMOS tokens que el
 * dashboard (packages/shared/src/theme.ts), no valores propios. Evita que
 * cada pantalla de la app tenga sus propios colores/espaciados sueltos.
 *
 * React Native no soporta variables CSS ni Tailwind directamente (salvo que
 * se integre NativeWind, ver nota en README.md de esta carpeta) — por eso
 * aquí se exponen los tokens como un objeto plano de JS, listo para usar en
 * StyleSheet.create() o pasarlo a NativeWind como theme si se decide usarlo.
 */
export function getTheme(mode: ThemeMode) {
  return {
    mode,
    colors: colorTokens[mode],
    typography,
    radii,
    spacing,
  };
}

export type Theme = ReturnType<typeof getTheme>;

// Uso típico en una pantalla, una vez inicializado el proyecto Expo:
//
// import { useColorScheme } from "react-native";
// import { getTheme } from "../theme.js";
//
// function CaptureScreen() {
//   const systemScheme = useColorScheme(); // "dark" | "light" | null
//   const theme = getTheme(systemScheme === "light" ? "light" : "dark"); // dark por defecto, igual que el dashboard
//   const styles = StyleSheet.create({
//     container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.md },
//     title: { color: theme.colors.textPrimary, fontFamily: theme.typography.display },
//   });
//   ...
// }
