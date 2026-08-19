import { useEffect, useState } from "react";
import { useFleetSocket } from "./hooks/useFleetSocket.js";
import { FleetMap } from "./components/FleetMap.js";
import { AlertsPanel } from "./components/AlertsPanel.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { VehicleDetailDrawer } from "./components/VehicleDetailDrawer.js";
import { useTheme } from "./theme/ThemeProvider.js";
import { getVehicleStatus, VEHICLE_STATUS } from "./lib/vehicleStatus.js";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        connected ? "bg-moving-subtle text-moving" : "bg-critical-subtle text-critical"
      }`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${
            connected ? "bg-moving animate-pulse-ring-moving" : "bg-critical animate-pulse-ring-critical"
          }`}
        />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${connected ? "bg-moving" : "bg-critical"}`} />
      </span>
      {connected ? "en vivo" : "desconectado"}
    </span>
  );
}

function ThemeSegmentedToggle() {
  const { mode, toggle } = useTheme();
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-raised p-0.5 text-xs">
      <button
        type="button"
        onClick={() => mode !== "dark" && toggle()}
        aria-pressed={mode === "dark"}
        className={`rounded px-2.5 py-1 transition-colors ${
          mode === "dark" ? "bg-surface text-text-primary" : "text-text-secondary hover:text-text-primary"
        }`}
      >
        Oscuro
      </button>
      <button
        type="button"
        onClick={() => mode !== "light" && toggle()}
        aria-pressed={mode === "light"}
        className={`rounded px-2.5 py-1 transition-colors ${
          mode === "light" ? "bg-surface text-text-primary" : "text-text-secondary hover:text-text-primary"
        }`}
      >
        Claro
      </button>
    </div>
  );
}

export default function App() {
  const { vehicles, alerts, connected } = useFleetSocket();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const now = useClock();

  const statusCounts = vehicles.reduce(
    (acc, v) => {
      acc[getVehicleStatus(v, alerts)]++;
      return acc;
    },
    { [VEHICLE_STATUS.MOVING]: 0, [VEHICLE_STATUS.STOPPED]: 0, [VEHICLE_STATUS.CRITICAL]: 0 },
  );

  return (
    <div className="min-h-screen bg-bg text-text-primary font-body p-6">
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-xl font-bold tracking-tight">SIMÓN MOVILIDAD</h1>
          <dl className="flex items-center gap-3 text-xs text-text-secondary font-mono">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-moving" />
              <dt className="sr-only">En movimiento</dt>
              <dd>{statusCounts[VEHICLE_STATUS.MOVING]}</dd>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-stopped" />
              <dt className="sr-only">Detenidos</dt>
              <dd>{statusCounts[VEHICLE_STATUS.STOPPED]}</dd>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-critical" />
              <dt className="sr-only">Críticos</dt>
              <dd>{statusCounts[VEHICLE_STATUS.CRITICAL]}</dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionPill connected={connected} />
          <span className="font-mono text-sm text-text-secondary tabular-nums">
            {now.toLocaleTimeString("es-CO", { hour12: false })}
          </span>
          <ThemeSegmentedToggle />
        </div>
      </header>

      <div className="flex gap-4 h-[calc(100vh-6rem)]">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <FleetMap vehicles={vehicles} alerts={alerts} onSelectVehicle={setSelectedVehicleId} />
        </div>
        <div className="w-[480px] shrink-0 flex flex-col gap-4 min-h-0">
          {selectedVehicleId ? (
            <VehicleDetailDrawer
              key={selectedVehicleId}
              vehicleId={selectedVehicleId}
              alerts={alerts}
              onClose={() => setSelectedVehicleId(null)}
            />
          ) : (
            <>
              <AlertsPanel alerts={alerts} />
              <div className="flex-1 min-h-0">
                <ChatPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
