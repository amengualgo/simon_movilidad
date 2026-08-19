import { useEffect, useRef, useState } from "react";
import { WS_MESSAGE_TYPE, type WsMessage, type VehicleStatusUpdate, type FleetAlert } from "@fleet/shared";

/**
 * Ver skill `websocket-patterns`. Reconexión con backoff exponencial acotado —
 * una desconexión no debe congelar el mapa en silencio, pero tampoco debe
 * bombardear al servidor con reintentos inmediatos en bucle.
 */
export function useFleetSocket() {
  const [vehicles, setVehicles] = useState<Record<string, VehicleStatusUpdate>>({});
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [connected, setConnected] = useState(false);
  const retryDelay = useRef(1000);

  useEffect(() => {
    let socket: WebSocket;
    let cancelled = false;

    function connect() {
      const wsUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000";
      socket = new WebSocket(`${wsUrl}/ws/fleet`);

      socket.onopen = () => {
        setConnected(true);
        retryDelay.current = 1000;
      };

      socket.onerror = (event) => {
        // El navegador dispara "close" justo después de "error" en la
        // mayoría de los casos, así que la reconexión ya está cubierta por
        // onclose — esto es solo para no perder visibilidad del motivo.
        console.error("Error de WebSocket:", event);
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsMessage;
          if (message.type === WS_MESSAGE_TYPE.TELEMETRY_UPDATE) {
            setVehicles((prev) => ({ ...prev, [message.data.vehicleId]: message.data }));
          } else if (message.type === WS_MESSAGE_TYPE.TELEMETRY_ALERT) {
            setAlerts((prev) => [message.data, ...prev].slice(0, 20));
          }
        } catch (err) {
          // Un mensaje malformado NO debe dejar el mapa congelado en
          // silencio — se descarta ese mensaje puntual y se sigue
          // escuchando; el próximo update válido restaura el estado.
          console.error("Mensaje de WebSocket malformado, descartado:", err);
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      socket?.close();
    };
  }, []);

  return { vehicles: Object.values(vehicles), alerts, connected };
}
