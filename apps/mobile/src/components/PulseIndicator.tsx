import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

/**
 * El "pulso": elemento de firma de la plataforma (ver
 * packages/shared/src/theme.ts `motion`). Un anillo que irradia desde el
 * indicador cuando hay GPS activo en movimiento; un vehículo/turno detenido
 * NO pulsa, queda estático — ver DESIGN_BRIEF.md.
 */
export function PulseIndicator({
  color,
  pulsing,
  durationMs = 2000,
  size = 120,
}: {
  color: string;
  pulsing: boolean;
  durationMs?: number;
  size?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulsing) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulsing, durationMs, progress]);

  const ringScale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const ringOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {pulsing && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: color,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}
      <View style={[styles.dot, { width: size * 0.55, height: size * 0.55, borderRadius: (size * 0.55) / 2, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 2 },
  dot: {},
});
