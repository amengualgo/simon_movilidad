import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme.js";
import type { ShiftSummary } from "../hooks/useDriverSession.js";
import { formatDuration } from "../lib/geo.js";

/** DM-04 — hoja de confirmación de fin de turno, superpuesta a CaptureScreen. */
export function EndShiftSheet({
  theme,
  summary,
  onCancel,
  onConfirm,
}: {
  theme: Theme;
  summary: ShiftSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = createStyles(theme);

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>¿Finalizar el turno?</Text>

          <View style={[styles.summaryCard, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}>
            <SummaryLine theme={theme} label="Duración" value={formatDuration(summary.durationMs)} />
            <SummaryLine theme={theme} label="Distancia" value={`${summary.distanceKm.toFixed(1)} km`} />
            <SummaryLine theme={theme} label="Eventos sincronizados" value={String(summary.syncedEvents)} />
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.button, { borderColor: theme.colors.border }]}>
              <Text style={[styles.buttonText, { color: theme.colors.textSecondary }]}>Seguir</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={[styles.button, styles.confirmButton, { backgroundColor: theme.colors.moving }]}>
              <Text style={[styles.buttonText, { color: theme.colors.bg }]}>Finalizar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryLine({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
      borderWidth: 1,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    title: { fontFamily: theme.typography.display, fontSize: 20, fontWeight: "700", textAlign: "center" },
    summaryCard: { borderWidth: 1, borderRadius: theme.radii.md, padding: theme.spacing.md, gap: theme.spacing.xs },
    summaryLine: { flexDirection: "row", justifyContent: "space-between" },
    summaryLabel: { fontFamily: theme.typography.body, fontSize: 13 },
    summaryValue: { fontFamily: theme.typography.mono, fontSize: 13, fontWeight: "600" },
    actions: { flexDirection: "row", gap: theme.spacing.sm },
    button: {
      flex: 1,
      borderWidth: 1,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.sm,
      alignItems: "center",
    },
    confirmButton: { borderColor: "transparent" },
    buttonText: { fontFamily: theme.typography.body, fontSize: 15, fontWeight: "700" },
  });
}
