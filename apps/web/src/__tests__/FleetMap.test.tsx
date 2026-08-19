import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FleetMap } from "../components/FleetMap.js";
import { ALERT_SEVERITY, type FleetAlert, type VehicleStatusUpdate } from "@fleet/shared";

/**
 * Cubre DW-01: el despachador debe poder distinguir de un vistazo qué
 * vehículos están en movimiento (con pulso) vs. detenidos (sin pulso, con
 * etiqueta explícita), sin tener que abrir el detalle de cada uno.
 *
 * react-leaflet/leaflet no montan un mapa real de forma confiable bajo
 * JSDOM (requieren tamaños de layout que JSDOM no calcula) — se sustituyen
 * por dobles ligeros que renderizan sus props/children como DOM plano, así
 * las aserciones semánticas (id de vehículo, etiqueta "detenido") siguen
 * verificando lo mismo que antes sin depender de un mapa real.
 */
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({
    children,
    eventHandlers,
  }: {
    children: React.ReactNode;
    eventHandlers?: { click?: () => void };
  }) => (
    <div data-testid="marker" onClick={() => eventHandlers?.click?.()}>
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function buildVehicle(overrides: Partial<VehicleStatusUpdate> = {}): VehicleStatusUpdate {
  return {
    vehicleId: "v-1",
    lat: 4.6,
    lng: -74.1,
    stoppedSince: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildAlert(overrides: Partial<FleetAlert> = {}): FleetAlert {
  return {
    vehicleId: "v-1",
    message: "Vehículo detenido en zona crítica",
    severity: ALERT_SEVERITY.CRITICAL,
    raisedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("FleetMap (DW-01)", () => {
  it("muestra el mensaje de espera cuando no hay vehículos (positivo)", () => {
    render(<FleetMap vehicles={[]} />);
    expect(screen.getByText(/Esperando telemetría/i)).toBeInTheDocument();
  });

  it("lista cada vehículo recibido por su ID (positivo)", () => {
    render(<FleetMap vehicles={[buildVehicle({ vehicleId: "v-1" }), buildVehicle({ vehicleId: "v-2" })]} />);
    expect(screen.getByText("v-1")).toBeInTheDocument();
    expect(screen.getByText("v-2")).toBeInTheDocument();
  });

  it('un vehículo detenido muestra la etiqueta "detenido" (positivo)', () => {
    render(<FleetMap vehicles={[buildVehicle({ stoppedSince: new Date().toISOString() })]} />);
    expect(screen.getByText("detenido")).toBeInTheDocument();
  });

  it('un vehículo en movimiento NO muestra la etiqueta "detenido" (negativo)', () => {
    render(<FleetMap vehicles={[buildVehicle({ stoppedSince: null })]} />);
    expect(screen.queryByText("detenido")).not.toBeInTheDocument();
  });

  it("muestra la leyenda con los tres estados y sus duraciones de pulso (positivo)", () => {
    render(<FleetMap vehicles={[buildVehicle()]} />);
    expect(screen.getByText(/En movimiento · pulso 2000ms/)).toBeInTheDocument();
    expect(screen.getByText(/Detenido · sin pulso/)).toBeInTheDocument();
    expect(screen.getByText(/Zona crítica · pulso 900ms/)).toBeInTheDocument();
  });

  it("un click en un marcador invoca onSelectVehicle con el vehicleId (positivo)", () => {
    const onSelectVehicle = vi.fn();
    render(<FleetMap vehicles={[buildVehicle({ vehicleId: "v-42" })]} onSelectVehicle={onSelectVehicle} />);
    fireEvent.click(screen.getByTestId("marker"));
    expect(onSelectVehicle).toHaveBeenCalledWith("v-42");
  });

  it("un vehículo con alerta crítica activa NO se etiqueta como detenido si sigue en movimiento (negativo)", () => {
    render(
      <FleetMap
        vehicles={[buildVehicle({ vehicleId: "v-9", stoppedSince: null })]}
        alerts={[buildAlert({ vehicleId: "v-9" })]}
      />,
    );
    expect(screen.queryByText("detenido")).not.toBeInTheDocument();
    expect(screen.getByText("en movimiento")).toBeInTheDocument();
  });
});
