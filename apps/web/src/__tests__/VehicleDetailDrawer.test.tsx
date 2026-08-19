import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VehicleDetailDrawer } from "../components/VehicleDetailDrawer.js";
import { ALERT_SEVERITY, type FleetAlert, type VehicleHistoryResponse } from "@fleet/shared";

/**
 * Cubre DW-04: el despachador debe poder abrir el detalle de un vehículo
 * (ruta reciente, velocidad, tiempo detenido, recorrido y sus alertas) sin
 * salir del dashboard, y el panel debe comunicar con claridad cuando el
 * historial no carga en vez de quedarse en blanco.
 */
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  CircleMarker: () => null,
  // react-leaflet no cae al ícono por defecto si `icon` llega undefined —
  // sobrescribe la opción y crashea en tiempo de ejecución (ver
  // VehicleDetailDrawer.tsx, plainDivIcon). Este mock reproduce ese
  // contrato para que un regreso a `icon={undefined}` rompa el test.
  Marker: ({ icon }: { icon?: unknown }) => {
    if (icon === undefined) {
      throw new Error("Marker requiere un icon explícito — react-leaflet no usa el default si es undefined");
    }
    return null;
  },
}));

function buildHistory(overrides: Partial<VehicleHistoryResponse> = {}): VehicleHistoryResponse {
  return {
    vehicleId: "v-1",
    zoneId: "zona-norte",
    stoppedSince: null,
    lastMovedAt: new Date().toISOString(),
    distanceKm: 12.4,
    positions: [
      { eventId: "e-2", lat: 4.61, lng: -74.11, speedKmh: 32, capturedAt: new Date().toISOString() },
      { eventId: "e-1", lat: 4.6, lng: -74.1, speedKmh: 0, capturedAt: new Date().toISOString() },
    ],
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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("VehicleDetailDrawer (DW-04)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra las estadísticas del vehículo cuando el historial carga (positivo)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildHistory(),
    });

    renderWithClient(<VehicleDetailDrawer vehicleId="v-1" alerts={[]} onClose={() => {}} />);

    expect(await screen.findByText(/12.4/)).toBeInTheDocument();
    expect(screen.getByText("v-1")).toBeInTheDocument();
  });

  it("muestra un mensaje de error explícito cuando el vehículo no existe (negativo)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not_found" }),
    });

    renderWithClient(<VehicleDetailDrawer vehicleId="v-404" alerts={[]} onClose={() => {}} />);

    expect(await screen.findByText(/No se encontró historial/i)).toBeInTheDocument();
  });

  it("filtra y muestra solo las alertas del vehículo seleccionado (positivo)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildHistory(),
    });

    const alerts = [buildAlert({ vehicleId: "v-1", message: "Alerta de v-1" }), buildAlert({ vehicleId: "v-2", message: "Alerta de otro vehículo" })];
    renderWithClient(<VehicleDetailDrawer vehicleId="v-1" alerts={alerts} onClose={() => {}} />);

    await screen.findByText("Alerta de v-1");
    expect(screen.queryByText("Alerta de otro vehículo")).not.toBeInTheDocument();
  });

  it('muestra el badge "alerta activa" solo si hay una alerta crítica activa para ese vehículo (negativo)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildHistory(),
    });

    renderWithClient(
      <VehicleDetailDrawer
        vehicleId="v-1"
        alerts={[buildAlert({ vehicleId: "v-1", severity: ALERT_SEVERITY.INFO })]}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText(/12.4/)).toBeInTheDocument());
    expect(screen.queryByText("alerta activa")).not.toBeInTheDocument();
  });
});
