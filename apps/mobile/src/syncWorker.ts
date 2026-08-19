import type { LocalStore } from "./offlineStore.js";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Disparado por un listener de conectividad (NetInfo), NUNCA por polling.
 * Envía todo lo pendiente en UN solo batch — no una request por coordenada.
 * Reutiliza el mismo pipeline de ingesta que la API expone para eventos
 * individuales (POST /telemetry/batch -> misma cola RabbitMQ). Ver skill
 * `mobile-offline-sync`.
 */
export async function syncPendingEvents(store: LocalStore): Promise<void> {
  const pending = await store.findPending();
  if (pending.length === 0) return;

  try {
    const response = await fetch(`${API_URL}/telemetry/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: pending.map((e) => ({
          eventId: e.eventId,
          vehicleId: e.vehicleId,
          lat: e.lat,
          lng: e.lng,
          capturedAt: e.capturedAt,
        })),
      }),
    });

    if (response.ok) {
      await store.markSynced(pending.map((e) => e.eventId));
    } else {
      // Respuesta no-ok: las filas quedan "pending", se reintenta en el
      // próximo evento de conectividad — pero SIN loguear, un fallo
      // persistente (ej. API_URL mal configurada) sería invisible para
      // siempre. El comportamiento de reintento no cambia, solo la
      // observabilidad.
      console.warn(`Sync de telemetría falló con status ${response.status}, quedan ${pending.length} pendientes`);
    }
  } catch (err) {
    // Red caída a mitad de sync: filas quedan "pending", reintento seguro
    // por ser idempotente — pero, igual que arriba, se loguea para no
    // ocultar un problema de configuración/red persistente.
    console.warn("Sync de telemetría falló por error de red:", err);
  }
}

/**
 * Ejemplo de wiring con NetInfo — se conecta en el proyecto Expo ya inicializado:
 *
 * import NetInfo from "@react-native-community/netinfo";
 * NetInfo.addEventListener((state) => {
 *   if (state.isConnected) syncPendingEvents(store);
 * });
 */
