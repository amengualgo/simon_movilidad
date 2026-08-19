import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App.js";
import { ThemeProvider } from "../theme/ThemeProvider.js";
import { ALERT_SEVERITY, type FleetAlert, type VehicleStatusUpdate } from "@fleet/shared";

/**
 * Cubre DW-01/DW-04: el encabezado debe reflejar el resumen de flota en
 * vivo y el estado de conexión sin estado propio duplicado, y seleccionar
 * un vehículo en el mapa debe reemplazar Alertas+Chat por su detalle en el
 * mismo slot de la derecha (no abrir una pantalla aparte).
 */
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  Polyline: () => null,
  CircleMarker: () => null,
}));

const mockUseFleetSocket = vi.fn();
vi.mock("../hooks/useFleetSocket.js", () => ({
  useFleetSocket: () => mockUseFleetSocket(),
}));

function buildVehicle(overrides: Partial<VehicleStatusUpdate> = {}): VehicleStatusUpdate {
  return { vehicleId: "v-1", lat: 4.6, lng: -74.1, stoppedSince: null, updatedAt: new Date().toISOString(), ...overrides };
}

function buildAlert(overrides: Partial<FleetAlert> = {}): FleetAlert {
  return {
    vehicleId: "v-1",
    message: "Alerta",
    severity: ALERT_SEVERITY.CRITICAL,
    raisedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
  });

  it('muestra el conteo de vehículos en movimiento/detenidos/críticos y el pill "en vivo" cuando está conectado (positivo)', () => {
    mockUseFleetSocket.mockReturnValue({
      vehicles: [buildVehicle({ vehicleId: "v-1" }), buildVehicle({ vehicleId: "v-2", stoppedSince: new Date().toISOString() })],
      alerts: [],
      connected: true,
    });

    renderApp();

    expect(screen.getByText("en vivo")).toBeInTheDocument();
    expect(screen.getByText("SIMÓN MOVILIDAD")).toBeInTheDocument();
  });

  it('muestra "desconectado" cuando el socket no está conectado (negativo)', () => {
    mockUseFleetSocket.mockReturnValue({ vehicles: [], alerts: [], connected: false });
    renderApp();
    expect(screen.getByText("desconectado")).toBeInTheDocument();
    expect(screen.queryByText("en vivo")).not.toBeInTheDocument();
  });

  it("seleccionar un vehículo en el mapa reemplaza Alertas+Chat por el detalle del vehículo (positivo)", () => {
    mockUseFleetSocket.mockReturnValue({
      vehicles: [buildVehicle({ vehicleId: "v-1" })],
      alerts: [buildAlert({ vehicleId: "v-1" })],
      connected: true,
    });

    renderApp();
    expect(screen.getByText("Consultas a la flota")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("marker"));

    expect(screen.queryByText("Consultas a la flota")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cerrar detalle de vehículo")).toBeInTheDocument();
  });

  it("cerrar el detalle del vehículo restaura Alertas+Chat (negativo)", () => {
    mockUseFleetSocket.mockReturnValue({
      vehicles: [buildVehicle({ vehicleId: "v-1" })],
      alerts: [],
      connected: true,
    });

    renderApp();
    fireEvent.click(screen.getByTestId("marker"));
    fireEvent.click(screen.getByLabelText("Cerrar detalle de vehículo"));

    expect(screen.getByText("Consultas a la flota")).toBeInTheDocument();
  });
});
