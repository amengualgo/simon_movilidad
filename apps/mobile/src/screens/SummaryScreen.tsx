import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme.js";
import type { DriverSession } from "../hooks/useDriverSession.js";
import { formatDuration } from "../lib/geo.js";

const SEGMENT_COUNT = 6;

/**
 * DM-05 — resumen de jornada, pantalla secundaria alcanzable con un botón
 * desde CaptureScreen (sin librería de navegación, ver App.tsx). Puramente
 * informativo — usa `info`/`textSecondary`, nunca rojo/ámbar salvo que haya
 * un error de sincronización persistente (no cubierto en este MVP).
 */
export function SummaryScreen({ theme, session, onBack }: { theme: Theme; session: DriverSession; onBack: () => void }) {
  const styles = createStyles(theme);
  const summary = session.shiftActive ? session.currentShiftSummary() : (session.lastShift ?? zeroSummary());
  const segments = bucketEventsByTime(
    session.shiftEvents.map((e) => new Date(e.capturedAt).getTime()),
    session.shiftStartedAt ?? session.nowMs - summary.durationMs,
    session.nowMs,
    SEGMENT_COUNT,
  );
  const maxSegment = Math.max(1, ...segments);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={[styles.back, { color: theme.colors.info }]}>← Volver</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Mi jornada</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          {new Date(session.nowMs).toLocaleDateString("es-CO", { day: "2-digit", month: "long" })} · {session.route}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <BigStat theme={theme} label="Tiempo activo" value={formatDuration(summary.durationMs)} />
        <BigStat theme={theme} label="Distancia" value={`${summary.distanceKm.toFixed(1)} km`} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Sincronización</Text>
        <SyncLine theme={theme} label="Eventos enviados" value={String(summary.syncedEvents)} />
        <SyncLine theme={theme} label="Eventos pendientes" value={String(summary.pendingEvents)} />
        <SyncLine
          theme={theme}
          label="Último envío"
          value={session.lastSyncAt ? new Date(session.lastSyncAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "Sin envíos aún"}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Actividad del turno</Text>
        {session.shiftEvents.length === 0 ? (
          <Text style={[styles.emptyChart, { color: theme.colors.textMuted }]}>Sin datos suficientes todavía.</Text>
        ) : (
          <View style={styles.chart}>
            {segments.map((count, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: 8 + (count / maxSegment) * 64,
                    backgroundColor: count > 0 ? theme.colors.moving : theme.colors.surfaceRaised,
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      <View style={[styles.note, { backgroundColor: theme.colors.infoSubtle, borderColor: theme.colors.info }]}>
        <Text style={[styles.noteText, { color: theme.colors.info }]}>
          Este resumen es informativo. El reporte oficial lo genera el despachador.
        </Text>
      </View>
    </View>
  );
}

function zeroSummary() {
  return { durationMs: 0, distanceKm: 0, syncedEvents: 0, pendingEvents: 0 };
}

/** Reparte timestamps en N cubetas iguales entre startMs y endMs — sin librería de gráficos. */
function bucketEventsByTime(timestamps: number[], startMs: number, endMs: number, buckets: number): number[] {
  const counts = new Array(buckets).fill(0);
  const span = Math.max(1, endMs - startMs);
  for (const t of timestamps) {
    const ratio = Math.min(1, Math.max(0, (t - startMs) / span));
    const idx = Math.min(buckets - 1, Math.floor(ratio * buckets));
    counts[idx] += 1;
  }
  return counts;
}

function BigStat({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  const styles = createStyles(theme);
  return (
    <View style={[styles.bigStat, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Text style={[styles.bigStatValue, { color: theme.colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.bigStatLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function SyncLine({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  const styles = createStyles(theme);
  return (
    <View style={styles.syncLine}>
      <Text style={[styles.syncLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.syncValue, { color: theme.colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.md, gap: theme.spacing.md },
    header: { gap: theme.spacing.xs },
    back: { fontFamily: theme.typography.body, fontSize: 14, fontWeight: "600" },
    title: { fontFamily: theme.typography.display, fontSize: 24, fontWeight: "700" },
    subtitle: { fontFamily: theme.typography.body, fontSize: 13 },
    statsRow: { flexDirection: "row", gap: theme.spacing.sm },
    bigStat: { flex: 1, borderWidth: 1, borderRadius: theme.radii.lg, padding: theme.spacing.md, alignItems: "center" },
    bigStatValue: { fontFamily: theme.typography.display, fontSize: 26, fontWeight: "700" },
    bigStatLabel: { fontFamily: theme.typography.body, fontSize: 12, marginTop: theme.spacing.xs },
    card: { borderWidth: 1, borderRadius: theme.radii.lg, padding: theme.spacing.md, gap: theme.spacing.sm },
    cardTitle: { fontFamily: theme.typography.display, fontSize: 15, fontWeight: "700" },
    syncLine: { flexDirection: "row", justifyContent: "space-between" },
    syncLabel: { fontFamily: theme.typography.body, fontSize: 13 },
    syncValue: { fontFamily: theme.typography.mono, fontSize: 13, fontWeight: "600" },
    emptyChart: { fontFamily: theme.typography.body, fontSize: 13 },
    chart: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.xs, height: 72 },
    bar: { flex: 1, borderRadius: theme.radii.sm },
    note: { borderWidth: 1, borderRadius: theme.radii.md, padding: theme.spacing.sm },
    noteText: { fontFamily: theme.typography.body, fontSize: 12, textAlign: "center" },
  });
}
