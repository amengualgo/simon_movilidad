import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme.js";

const CONFIRMATION_VISIBLE_MS = 3000;

/**
 * DM-03 — banner de sync. Se alimenta del `pendingCount` real de
 * `offlineStore`/`syncWorker` (vía `useDriverSession`), nunca de un mock
 * desconectado: mientras haya eventos "pending" muestra el conteo en ámbar;
 * cuando ese conteo cae a cero tras haber tenido pendientes, muestra una
 * confirmación breve en teal con ✓ y luego se oculta sola.
 *
 * Vive en el flujo normal de cada pantalla (no como overlay `position:
 * absolute` superpuesto) — cada pantalla lo renderiza donde le corresponde
 * en su propio layout, así que nunca tapa nada: empuja el contenido de
 * abajo en vez de flotar encima. Evita tener que adivinar un offset de
 * píxeles que despeje headers de alturas distintas entre pantallas.
 */
export function SyncToast({ theme, pendingCount }: { theme: Theme; pendingCount: number }) {
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const prevPendingRef = useRef(pendingCount);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingCount;
    if (prev > 0 && pendingCount === 0) {
      setConfirmation(prev);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setConfirmation(null), CONFIRMATION_VISIBLE_MS);
    }
  }, [pendingCount]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (pendingCount === 0 && confirmation === null) return null;

  const styles = createStyles(theme);

  if (pendingCount > 0) {
    return (
      <View style={[styles.toast, { backgroundColor: theme.colors.stoppedSubtle, borderColor: theme.colors.stopped }]}>
        <Text style={[styles.text, { color: theme.colors.stopped }]}>
          Eventos pendientes de envío · {pendingCount}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.toast, { backgroundColor: theme.colors.movingSubtle, borderColor: theme.colors.moving }]}>
      <Text style={[styles.text, { color: theme.colors.moving }]}>
        ✓ {confirmation} evento{confirmation === 1 ? "" : "s"} sincronizado{confirmation === 1 ? "" : "s"} · Nada quedó sin reportar
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    toast: {
      borderWidth: 1,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    text: {
      fontFamily: theme.typography.body,
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },
  });
}
