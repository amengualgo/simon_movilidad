import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getTheme } from "./src/theme.js";
import { useDriverSession } from "./src/hooks/useDriverSession.js";
import { CaptureScreen } from "./src/screens/CaptureScreen.js";
import { SummaryScreen } from "./src/screens/SummaryScreen.js";
import { EndShiftSheet } from "./src/screens/EndShiftSheet.js";

/**
 * Raíz de la app. Una sola pantalla persistente (captura) + una secundaria
 * (resumen) alcanzable con un botón — sin `react-navigation`, ver
 * README.md ("por qué no una librería de navegación"): es una decisión
 * deliberada de simplicidad para el alcance de esta app, no una omisión.
 */
export default function App() {
  const systemScheme = useColorScheme();
  const theme = getTheme(systemScheme === "light" ? "light" : "dark"); // oscuro por defecto, igual que el dashboard
  const [screen, setScreen] = useState<"main" | "summary">("main");
  const [confirmingEndShift, setConfirmingEndShift] = useState(false);
  const session = useDriverSession();

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {screen === "main" ? (
          <CaptureScreen
            theme={theme}
            session={session}
            onOpenSummary={() => setScreen("summary")}
            onRequestEndShift={() => setConfirmingEndShift(true)}
          />
        ) : (
          <SummaryScreen theme={theme} session={session} onBack={() => setScreen("main")} />
        )}

        {confirmingEndShift && (
          <EndShiftSheet
            theme={theme}
            summary={session.currentShiftSummary()}
            onCancel={() => setConfirmingEndShift(false)}
            onConfirm={() => {
              session.endShift();
              setConfirmingEndShift(false);
            }}
          />
        )}

        <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
      </View>
    </SafeAreaProvider>
  );
}
