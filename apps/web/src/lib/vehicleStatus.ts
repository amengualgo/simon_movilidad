import { ALERT_SEVERITY, type FleetAlert, type VehicleStatusUpdate } from "@fleet/shared";

export const VEHICLE_STATUS = {
  MOVING: "moving",
  STOPPED: "stopped",
  CRITICAL: "critical",
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS];

/**
 * VehicleStatusUpdate no trae un campo "critical" propio todavía — la única
 * señal disponible es si el vehículo tiene una alerta activa de severidad
 * crítica. Centralizado aquí porque FleetMap (color/pulso del marcador),
 * App (resumen de flota) y VehicleDetailDrawer (badge "alerta activa")
 * necesitan exactamente el mismo criterio; duplicarlo en los tres sitios
 * es cómo se desincronizan este tipo de reglas en silencio.
 */
export function getVehicleStatus(vehicle: VehicleStatusUpdate, alerts: FleetAlert[]): VehicleStatus {
  const hasCriticalAlert = alerts.some(
    (a) => a.vehicleId === vehicle.vehicleId && a.severity === ALERT_SEVERITY.CRITICAL,
  );
  if (hasCriticalAlert) return VEHICLE_STATUS.CRITICAL;
  return vehicle.stoppedSince ? VEHICLE_STATUS.STOPPED : VEHICLE_STATUS.MOVING;
}

export function hasCriticalAlert(vehicleId: string, alerts: FleetAlert[]): boolean {
  return alerts.some((a) => a.vehicleId === vehicleId && a.severity === ALERT_SEVERITY.CRITICAL);
}
