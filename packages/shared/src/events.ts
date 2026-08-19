/**
 * Contrato de mensajes de WebSocket entre el worker/API y el dashboard.
 * Mantener esto tipado y compartido evita que frontend y backend se desincronicen.
 *
 * WS_MESSAGE_TYPE y ALERT_SEVERITY están centralizados aquí como constantes
 * "as const" (equivalente idiomático a un enum en TS) porque antes eran
 * strings literales repetidos sueltos en worker/consumer.ts, web/useFleetSocket.ts
 * y web/AlertsPanel.tsx — un typo en cualquiera de esos puntos habría roto el
 * discriminador de tipo en silencio, sin error de compilación.
 */
export const WS_MESSAGE_TYPE = {
  TELEMETRY_UPDATE: "telemetry:update",
  TELEMETRY_ALERT: "telemetry:alert",
} as const;

export type WsMessageType = (typeof WS_MESSAGE_TYPE)[keyof typeof WS_MESSAGE_TYPE];

export const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

export type AlertSeverity = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY];

export type WsMessage =
  | { type: typeof WS_MESSAGE_TYPE.TELEMETRY_UPDATE; data: VehicleStatusUpdate }
  | { type: typeof WS_MESSAGE_TYPE.TELEMETRY_ALERT; data: FleetAlert };

export interface VehicleStatusUpdate {
  vehicleId: string;
  lat: number;
  lng: number;
  zoneId?: string;
  stoppedSince: string | null;
  updatedAt: string;
}

export interface FleetAlert {
  vehicleId: string;
  message: string;
  severity: AlertSeverity;
  raisedAt: string;
}

/**
 * Contrato de GET /vehicles/:vehicleId/history (drawer de detalle DW-04).
 * `positions` viene ordenado más reciente primero (mismo orden en que lo
 * pinta la tabla "posiciones recientes" del mockup, así el frontend no
 * tiene que invertir el array).
 */
export interface VehiclePosition {
  eventId: string;
  lat: number;
  lng: number;
  speedKmh: number | null;
  capturedAt: string;
}

export interface VehicleHistoryResponse {
  vehicleId: string;
  zoneId: string | null;
  stoppedSince: string | null;
  lastMovedAt: string;
  distanceKm: number;
  positions: VehiclePosition[];
}

// Nombres de exchanges/colas de RabbitMQ, centralizados para evitar strings mágicos duplicados.
export const RABBITMQ_TOPOLOGY = {
  exchange: "telemetry",
  queueRaw: "telemetry.raw",
  routingKeyRaw: "raw",
  dlxExchange: "telemetry.dlx",
  queueDeadLetter: "telemetry.dead-letter",
  routingKeyDeadLetter: "dead-letter",
  // Fanout: el worker publica aquí tras persistir; la API lo consume para retransmitir por WebSocket.
  broadcastExchange: "telemetry.broadcast",
} as const;
