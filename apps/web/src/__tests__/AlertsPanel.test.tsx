import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertsPanel } from "../components/AlertsPanel.js";
import { ALERT_SEVERITY, type FleetAlert } from "@fleet/shared";

/**
 * Cubre DW-02: las alertas deben distinguirse visualmente por severidad
 * (color) y el panel debe indicar claramente cuando no hay ninguna, en vez
 * de mostrar una lista vacía ambigua.
 */
function buildAlert(overrides: Partial<FleetAlert> = {}): FleetAlert {
  return {
    vehicleId: "v-1",
    message: "Vehículo detenido en zona crítica",
    severity: ALERT_SEVERITY.CRITICAL,
    raisedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("AlertsPanel (DW-02)", () => {
  it('muestra "Sin alertas activas" cuando la lista está vacía (positivo)', () => {
    render(<AlertsPanel alerts={[]} />);
    expect(screen.getByText(/Sin alertas activas/i)).toBeInTheDocument();
  });

  it("renderiza el mensaje de cada alerta recibida (positivo)", () => {
    const alerts = [buildAlert({ message: "Alerta A" }), buildAlert({ message: "Alerta B" })];
    render(<AlertsPanel alerts={alerts} />);

    expect(screen.getByText("Alerta A")).toBeInTheDocument();
    expect(screen.getByText("Alerta B")).toBeInTheDocument();
  });

  it("aplica la clase de color correspondiente a la severidad crítica (positivo)", () => {
    render(<AlertsPanel alerts={[buildAlert({ severity: ALERT_SEVERITY.CRITICAL, message: "Crítica" })]} />);
    expect(screen.getByText("Crítica")).toHaveClass("text-critical");
  });

  it("aplica la clase de color correspondiente a la severidad info, no la crítica (negativo)", () => {
    render(<AlertsPanel alerts={[buildAlert({ severity: ALERT_SEVERITY.INFO, message: "Informativa" })]} />);
    expect(screen.getByText("Informativa")).not.toHaveClass("text-critical");
  });
});
