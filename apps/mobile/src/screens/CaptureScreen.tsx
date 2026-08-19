import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Theme } from "../theme.js";
import type { DriverSession } from "../hooks/useDriverSession.js";
import { PulseIndicator } from "../components/PulseIndicator.js";
import { SyncToast } from "../components/SyncToast.js";
import { formatDuration } from "../lib/geo.js";

/**
 * DM-01/DM-02/DM-04 — pantalla principal, única pantalla persistente
 * durante la conducción. Dos estados: turno activo (captura en curso) o
 * turno inactivo (nada se registra). Todo el color/tipografía sale de
 * `getTheme()` — ver constraints en el encargo, ningún hex/fuente suelto aquí.
 */
export function CaptureScreen({
  theme,
  session,
  onOpenSummary,
  onRequestEndShift,
}: {
  theme: Theme;
  session: DriverSession;
  onOpenSummary: () => void;
  onRequestEndShift: () => void;
}) {
  const styles = createStyles(theme);
  const clock = new Date(session.nowMs).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.topRow}>
        {session.shiftActive ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: session.isOnline ? theme.colors.movingSubtle : theme.colors.infoSubtle,
              },
            ]}
          >
            <Text style={[styles.bannerText, { color: session.isOnline ? theme.colors.moving : theme.colors.info }]}>
              {session.isOnline ? "Sincronizado" : "Sin conexión"}
            </Text>
            <Text style={[styles.clock, { color: theme.colors.textSecondary }]}>{clock}</Text>
          </View>
        ) : (
          <View />
        )}
        <Pressable onPress={onOpenSummary} hitSlop={12}>
          <Text style={[styles.link, { color: theme.colors.info }]}>Mi jornada →</Text>
        </Pressable>
      </View>

      <SyncToast theme={theme} pendingCount={session.pendingCount} />

      {session.shiftActive ? <ActiveShift theme={theme} session={session} onRequestEndShift={onRequestEndShift} /> : <InactiveShift theme={theme} session={session} />}
    </SafeAreaView>
  );
}

function ActiveShift({
  theme,
  session,
  onRequestEndShift,
}: {
  theme: Theme;
  session: DriverSession;
  onRequestEndShift: () => void;
}) {
  const styles = createStyles(theme);
  const moving = session.movement === "moving";
  const indicatorColor = moving ? theme.colors.moving : theme.colors.stopped;
  const subtitle = !session.isOnline
    ? "Modo local · se enviará al reconectar"
    : moving
      ? "Tu recorrido se está documentando"
      : "Sin movimiento";

  return (
    <>
      <View style={styles.center}>
        <PulseIndicator color={indicatorColor} pulsing={moving} durationMs={2000} size={140} />
        <Text style={[styles.stateLabel, { color: theme.colors.textPrimary }]}>Registrando</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard theme={theme} label="Turno" value={formatDuration(session.shiftStartedAt ? session.nowMs - session.shiftStartedAt : 0)} />
        <StatCard theme={theme} label="Distancia" value={`${session.distanceKm.toFixed(1)} km`} />
      </View>

      <InfoRow theme={theme} label="Eventos pendientes" value={String(session.pendingCount)} />
      <InfoRow theme={theme} label="Ruta asignada" value={session.route} />

      <Pressable
        onPress={onRequestEndShift}
        style={[styles.primaryButton, { backgroundColor: theme.colors.criticalSubtle, borderColor: theme.colors.critical }]}
      >
        <Text style={[styles.primaryButtonText, { color: theme.colors.critical }]}>Finalizar turno</Text>
      </Pressable>
    </>
  );
}

function InactiveShift({ theme, session }: { theme: Theme; session: DriverSession }) {
  const styles = createStyles(theme);
  return (
    <>
      <View style={styles.center}>
        <PulseIndicator color={theme.colors.textMuted} pulsing={false} size={140} />
        <Text style={[styles.stateLabel, { color: theme.colors.textPrimary }]}>Turno inactivo</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Tus trayectos personales no se registran mientras el turno está inactivo.
        </Text>
      </View>

      <InfoRow
        theme={theme}
        label="Último turno"
        value={
          session.lastShift
            ? `${formatDuration(session.lastShift.durationMs)} · ${session.lastShift.distanceKm.toFixed(1)} km`
            : "Sin turnos previos"
        }
      />

      <Pressable onPress={session.startShift} style={[styles.primaryButton, { backgroundColor: theme.colors.moving }]}>
        <Text style={[styles.primaryButtonText, { color: theme.colors.bg }]}>Iniciar turno</Text>
      </Pressable>
    </>
  );
}

function StatCard({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  const styles = createStyles(theme);
  return (
    <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function InfoRow({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  const styles = createStyles(theme);
  return (
    <View style={[styles.infoRow, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
      <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.md },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radii.full,
    },
    bannerText: { fontFamily: theme.typography.body, fontWeight: "700", fontSize: 13 },
    clock: { fontFamily: theme.typography.mono, fontSize: 13 },
    link: { fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm },
    stateLabel: { fontFamily: theme.typography.display, fontSize: 28, fontWeight: "700" },
    subtitle: { fontFamily: theme.typography.body, fontSize: 14, textAlign: "center", paddingHorizontal: theme.spacing.lg },
    statsRow: { flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
    statCard: { flex: 1, borderWidth: 1, borderRadius: theme.radii.lg, padding: theme.spacing.md, alignItems: "center" },
    statValue: { fontFamily: theme.typography.display, fontSize: 22, fontWeight: "700" },
    statLabel: { fontFamily: theme.typography.body, fontSize: 12, marginTop: theme.spacing.xs },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    infoLabel: { fontFamily: theme.typography.body, fontSize: 13 },
    infoValue: { fontFamily: theme.typography.mono, fontSize: 13, fontWeight: "600" },
    primaryButton: {
      borderWidth: 1,
      borderColor: "transparent",
      borderRadius: theme.radii.lg,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
      marginTop: theme.spacing.xs,
    },
    primaryButtonText: { fontFamily: theme.typography.display, fontSize: 16, fontWeight: "700" },
  });
}
