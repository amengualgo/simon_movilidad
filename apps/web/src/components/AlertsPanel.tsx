import type { FleetAlert } from "@fleet/shared";
import { ALERT_SEVERITY } from "@fleet/shared";

const severityClasses: Record<FleetAlert["severity"], string> = {
  [ALERT_SEVERITY.INFO]: "text-info",
  [ALERT_SEVERITY.WARNING]: "text-stopped",
  [ALERT_SEVERITY.CRITICAL]: "text-critical",
};

const severityCardClasses: Record<FleetAlert["severity"], string> = {
  [ALERT_SEVERITY.INFO]: "border-l-info bg-info-subtle",
  [ALERT_SEVERITY.WARNING]: "border-l-stopped bg-stopped-subtle",
  [ALERT_SEVERITY.CRITICAL]: "border-l-critical bg-critical-subtle",
};

export function AlertsPanel({ alerts }: { alerts: FleetAlert[] }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-4">
      <h2 className="font-display text-sm font-medium text-text-secondary mb-3 uppercase tracking-wide">
        Alertas
      </h2>
      {alerts.length === 0 ? (
        <p className="text-text-muted text-sm">Sin alertas activas.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {alerts.map((a, i) => (
            <li key={i} className={`rounded border-l-4 px-3 py-2 ${severityCardClasses[a.severity]}`}>
              <span className={severityClasses[a.severity]}>{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
