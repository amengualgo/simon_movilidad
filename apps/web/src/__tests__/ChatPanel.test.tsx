import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatPanel } from "../components/ChatPanel.js";

/**
 * Cubre DW-03: el despachador debe poder consultar al agente de IA en
 * lenguaje natural y distinguir con claridad una respuesta real de una
 * degradación del circuit breaker (agente caído), en vez de tratarlas igual.
 */
describe("ChatPanel (DW-03)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function ask(query: string) {
    fireEvent.change(screen.getByPlaceholderText(/qué vehículos/i), { target: { value: query } });
    fireEvent.click(screen.getByRole("button", { name: /preguntar/i }));
  }

  it("muestra la respuesta normal del agente cuando la consulta tiene éxito (positivo)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ answer: "3 vehículos llevan más de 20 minutos detenidos." }),
    });

    render(<ChatPanel />);
    await ask("¿Qué vehículos llevan detenidos?");

    expect(await screen.findByText("3 vehículos llevan más de 20 minutos detenidos.")).toBeInTheDocument();
    expect(screen.queryByText(/Agente no disponible/i)).not.toBeInTheDocument();
  });

  it("muestra un estado degradado distinto cuando el circuit breaker está abierto (negativo)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "El servicio de consultas está temporalmente no disponible. Intenta de nuevo en unos segundos.",
        degraded: true,
      }),
    });

    render(<ChatPanel />);
    await ask("¿Qué vehículos llevan detenidos?");

    expect(await screen.findByText(/Agente no disponible · el mapa sigue en vivo/i)).toBeInTheDocument();
  });

  it("muestra un error claro cuando el servidor responde con un código de error (negativo)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    render(<ChatPanel />);
    await ask("¿Qué vehículos llevan detenidos?");

    expect(await screen.findByText(/El servidor no pudo procesar la consulta/i)).toBeInTheDocument();
  });
});
