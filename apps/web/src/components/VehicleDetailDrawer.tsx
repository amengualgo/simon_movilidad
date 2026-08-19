import { useQuery } from "@tanstack/react-query";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FleetAlert, VehicleHistoryResponse, VehiclePosition } from "@fleet/shared";
import { ALERT_SEVERITY } from "@fleet/shared";
import { hasCriticalAlert } from "../lib/vehicleStatus.js";
import { cssVarColor } from "../lib/cssVarColor.js";

const HISTORY_WINDOW_MINUTES = 120;
// Umbral simple para el gráfico de barras y los puntos de la mini-ruta: por
// debajo de este valor se considera "detenido/lento", no "en movimiento".
// No hay una librería de gráficos de por medio a propósito (ver spec) —
// son divs con altura proporcional a la velocidad.
const MOVING_SPEED_THRESHOLD_KMH = 5;

function speedBarColorClass(speedKmh: number | null): string {
  if (speedKmh === null || speedKmh === 0) return "bg-critical";
  if (speedKmh < MOVING_SPEED_THRESHOLD_KMH) return "bg-stopped";
  return "bg-moving";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour12: false });
}

function formatStoppedDuration(stoppedSince: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(stoppedSince).getTime()) / 60000));
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function pulsingDivIcon(): L.DivIcon {
  return L.divIcon({
    html: `<span class="relative flex h-3.5 w-3.5">
      <span class="absolute inline-flex h-full w-full rounded-full bg-critical animate-pulse-ring-critical"></span>
      <span class="relative inline-flex h-3.5 w-3.5 rounded-full border border-bg bg-critical"></span>
    </span>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// react-leaflet no cae al ícono por defecto de Leaflet si le pasas
// `icon={undefined}` — sobrescribe la opción con `undefined` literal y
// crashea en `_initIcon` (options.icon is undefined). Por eso el caso no
// crítico también necesita un DivIcon explícito, nunca `undefined`.
function plainDivIcon(): L.DivIcon {
  return L.divIcon({
    html: `<span class="relative inline-flex h-3.5 w-3.5 rounded-full border border-bg bg-moving"></span>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

async function fetchVehicleHistory(vehicleId: string): Promise<VehicleHistoryResponse> {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
  const res = await fetch(`${apiUrl}/vehicles/${vehicleId}/history?minutes=${HISTORY_WINDOW_MINUTES}`);
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error("request_failed");
  return res.json() as Promise<VehicleHistoryResponse>;
}

export interface VehicleDetailDrawerProps {
  vehicleId: string;
  alerts: FleetAlert[];
  onClose: () => void;
}

/**
 * Detalle de vehículo (DW-04), previamente no implementado. Se abre en el
 * mismo slot de 480px que ocupan AlertsPanel + ChatPanel en App.tsx.
 */
export function VehicleDetailDrawer({ vehicleId, alerts, onClose }: VehicleDetailDrawerProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["vehicle-history", vehicleId, HISTORY_WINDOW_MINUTES],
    queryFn: () => fetchVehicleHistory(vehicleId),
  });

  const vehicleAlerts = alerts.filter((a) => a.vehicleId === vehicleId);
  const isCritical = hasCriticalAlert(vehicleId, alerts);
  const latest: VehiclePosition | undefined = data?.positions[0];
  const routeLatLng: [number, number][] = data ? data.positions.map((p) => [p.lat, p.lng]) : [];

  return (
    <div className="rounded-lg bg-surface border border-border h-full flex flex-col overflow-hidden">
      <header className="flex items-start justify-between p-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-text-primary">{vehicleId}</h2>
            {isCritical && (
              <span className="relative inline-flex items-center gap-1 rounded-full bg-critical-subtle px-2 py-0.5 text-[11px] font-medium text-critical">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-critical animate-pulse-ring-critical" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-critical" />
                </span>
                alerta activa
              </span>
            )}
          </div>
          {/* Placeholder explícito: todavía no existe un catálogo Vehicle (unidad/modelo/año) — no se inventa un dato real. */}
          <p className="text-xs text-text-muted mt-0.5">Unidad de reparto · Modelo 2022</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar detalle de vehículo"
          className="text-text-secondary hover:text-text-primary text-lg leading-none px-1"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* Placeholder explícito: todavía no existe un catálogo Driver asociado al vehículo — no se inventa un dato real. */}
        <div className="flex items-center justify-between rounded bg-surface-raised px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-info-subtle text-info text-xs font-semibold">
              CD
            </span>
            <div>
              <p className="text-text-primary text-sm">Conductor por asignar</p>
              <p className="text-text-muted text-xs">Turno 06:00 – 14:00</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
          >
            Contactar
          </button>
        </div>

        {isLoading && <p className="text-text-muted text-sm">Cargando historial del vehículo…</p>}
        {isError && (
          <p className="text-critical text-sm">
            {error instanceof Error && error.message === "not_found"
              ? "No se encontró historial para este vehículo."
              : "No se pudo cargar el historial del vehículo."}
          </p>
        )}

        {data && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded bg-surface-raised px-3 py-2">
                <p className="text-text-muted text-[11px] uppercase tracking-wide">Velocidad</p>
                <p className="font-display text-lg text-text-primary">
                  {latest?.speedKmh ?? "—"} <span className="text-xs text-text-muted">km/h</span>
                </p>
              </div>
              <div className="rounded bg-surface-raised px-3 py-2">
                <p className="text-text-muted text-[11px] uppercase tracking-wide">Tiempo detenido</p>
                <p className="font-display text-lg text-text-primary">
                  {data.stoppedSince ? formatStoppedDuration(data.stoppedSince) : "—"}
                </p>
              </div>
              <div className="rounded bg-surface-raised px-3 py-2">
                <p className="text-text-muted text-[11px] uppercase tracking-wide">Recorrido</p>
                <p className="font-display text-lg text-text-primary">
                  {data.distanceKm.toFixed(1)} <span className="text-xs text-text-muted">km</span>
                </p>
              </div>
            </div>

            {data.positions.length > 0 && (
              <div className="h-40 rounded overflow-hidden border border-border">
                <MapContainer
                  center={[data.positions[0].lat, data.positions[0].lng]}
                  zoom={14}
                  scrollWheelZoom={false}
                  className="h-full w-full"
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  <Polyline positions={routeLatLng} pathOptions={{ color: cssVarColor("--color-moving"), weight: 3 }} />
                  {data.positions.slice(1).map((p) => (
                    <CircleMarker
                      key={p.eventId}
                      center={[p.lat, p.lng]}
                      radius={3}
                      pathOptions={{ color: cssVarColor("--color-text-secondary"), fillOpacity: 0.8 }}
                    />
                  ))}
                  {latest && (
                    <Marker
                      position={[latest.lat, latest.lng]}
                      icon={isCritical ? pulsingDivIcon() : plainDivIcon()}
                    />
                  )}
                </MapContainer>
              </div>
            )}

            {data.positions.length > 0 && (
              <div>
                <p className="text-text-muted text-[11px] uppercase tracking-wide mb-1">Velocidad reciente</p>
                <div className="flex items-end gap-1 h-16">
                  {[...data.positions].reverse().map((p) => (
                    <div
                      key={p.eventId}
                      title={`${p.speedKmh ?? 0} km/h`}
                      className={`flex-1 rounded-t ${speedBarColorClass(p.speedKmh)}`}
                      style={{ height: `${Math.min(100, ((p.speedKmh ?? 0) / 80) * 100)}%` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-text-muted text-[11px] uppercase tracking-wide mb-1">Posiciones recientes</p>
              <table className="w-full font-mono text-xs text-text-secondary">
                <thead>
                  <tr className="text-text-muted text-left">
                    <th className="font-normal pb-1">Hora</th>
                    <th className="font-normal pb-1">Lat, Lon</th>
                    <th className="font-normal pb-1 text-right">Km/h</th>
                  </tr>
                </thead>
                <tbody>
                  {data.positions.map((p) => (
                    <tr key={p.eventId} className="border-t border-border">
                      <td className="py-1">{formatTime(p.capturedAt)}</td>
                      <td className="py-1">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </td>
                      <td className="py-1 text-right">{p.speedKmh ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div>
          <p className="text-text-muted text-[11px] uppercase tracking-wide mb-1">Alertas de este vehículo</p>
          {vehicleAlerts.length === 0 ? (
            <p className="text-text-muted text-sm">Sin alertas para este vehículo.</p>
          ) : (
            <ul className="space-y-1">
              {vehicleAlerts.map((a, i) => (
                <li
                  key={i}
                  className={`rounded border-l-2 px-2 py-1 text-xs ${
                    a.severity === ALERT_SEVERITY.CRITICAL
                      ? "border-critical bg-critical-subtle text-critical"
                      : a.severity === ALERT_SEVERITY.WARNING
                        ? "border-stopped bg-stopped-subtle text-stopped"
                        : "border-info bg-info-subtle text-info"
                  }`}
                >
                  {a.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
