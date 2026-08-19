import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FleetAlert, VehicleStatusUpdate } from "@fleet/shared";
import { getVehicleStatus, type VehicleStatus } from "../lib/vehicleStatus.js";

// Bogotá, centro operativo de la flota de referencia de este MVP.
const BOGOTA_CENTER: [number, number] = [4.65, -74.1];
const DEFAULT_ZOOM = 12;

function buildDotHtml(status: VehicleStatus): string {
  const dotColorClass =
    status === "moving" ? "bg-moving" : status === "critical" ? "bg-critical" : "bg-stopped";
  const ringClass =
    status === "moving"
      ? "bg-moving animate-pulse-ring-moving"
      : status === "critical"
        ? "bg-critical animate-pulse-ring-critical"
        : "";
  // Detenido = punto estático, sin anillo — el pulso es la señal exclusiva
  // de "GPS activo en movimiento" / "alerta crítica", no un adorno genérico.
  return `<span class="relative flex h-3.5 w-3.5">
    ${ringClass ? `<span class="absolute inline-flex h-full w-full rounded-full ${ringClass}"></span>` : ""}
    <span class="relative inline-flex h-3.5 w-3.5 rounded-full border border-bg ${dotColorClass}"></span>
  </span>`;
}

function buildVehicleIcon(status: VehicleStatus): L.DivIcon {
  return L.divIcon({
    html: buildDotHtml(status),
    className: "", // sin esto, Leaflet aplica su clase `leaflet-div-icon` con fondo/borde propios
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function stoppedMinutes(stoppedSince: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(stoppedSince).getTime()) / 60000));
}

export interface FleetMapProps {
  vehicles: VehicleStatusUpdate[];
  alerts?: FleetAlert[];
  onSelectVehicle?: (vehicleId: string) => void;
}

/**
 * El anillo de "pulso" (animate-pulse-ring-moving / -critical) es el
 * elemento de firma de la plataforma — indica GPS activo en tiempo real vs.
 * alerta crítica. Ver packages/shared/src/theme.ts (motion) y src/index.css.
 */
export function FleetMap({ vehicles, alerts = [], onSelectVehicle }: FleetMapProps) {
  return (
    <div className="relative rounded-lg bg-surface border border-border h-full overflow-hidden">
      <h2 className="sr-only">Mapa en vivo</h2>
      {vehicles.length === 0 ? (
        <p className="text-text-muted text-sm p-4">Esperando telemetría de vehículos...</p>
      ) : (
        <MapContainer center={BOGOTA_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="h-full w-full">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {vehicles.map((v) => {
            const status = getVehicleStatus(v, alerts);
            const isStopped = Boolean(v.stoppedSince);
            return (
              <Marker
                key={v.vehicleId}
                position={[v.lat, v.lng]}
                icon={buildVehicleIcon(status)}
                eventHandlers={{ click: () => onSelectVehicle?.(v.vehicleId) }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -10]}
                  className="!bg-transparent !border-0 !shadow-none !p-0"
                >
                  <div className="rounded bg-surface-raised border border-border px-2 py-1 text-xs font-mono text-text-primary whitespace-nowrap">
                    <span className="font-semibold">{v.vehicleId}</span>
                    {" · "}
                    {isStopped ? (
                      // VehicleStatusUpdate no trae speedKmh (solo llega en el
                      // histórico de VehicleDetailDrawer) — en el mapa en vivo
                      // solo podemos mostrar tiempo detenido, no velocidad real.
                      <span className="text-stopped">
                        <span>detenido</span> · {stoppedMinutes(v.stoppedSince!)}min
                      </span>
                    ) : (
                      <span className="text-moving">en movimiento</span>
                    )}
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
      )}

      <div className="absolute bottom-3 left-3 z-[1000] rounded-md bg-surface/95 border border-border p-2.5 text-[11px] text-text-secondary space-y-1.5 backdrop-blur-sm">
        <p className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-moving" /> En movimiento · pulso 2000ms
        </p>
        <p className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-stopped" /> Detenido · sin pulso
        </p>
        <p className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-critical" /> Zona crítica · pulso 900ms
        </p>
      </div>
    </div>
  );
}
