import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cubre DW-03: el agente solo puede responder correctamente a "¿qué
 * vehículos llevan detenidos más de N minutos?" si la función subyacente
 * filtra bien el umbral — es la pieza que hace confiable la respuesta en
 * lenguaje natural, independientemente de qué tan bien "entienda" el LLM.
 */
const vehicleStatuses = [
  { vehicleId: "v-1", zoneId: "zona-a", stoppedSince: new Date(Date.now() - 30 * 60_000), lastLat: 4.6, lastLng: -74.1 },
  { vehicleId: "v-2", zoneId: "zona-a", stoppedSince: new Date(Date.now() - 5 * 60_000), lastLat: 4.6, lastLng: -74.1 },
  { vehicleId: "v-3", zoneId: "zona-b", stoppedSince: null, lastLat: 4.6, lastLng: -74.1 },
];

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    vehicleStatus: {
      findMany: vi.fn(async ({ where }) => {
        return vehicleStatuses.filter((v) => {
          if (where.stoppedSince) {
            if (v.stoppedSince === null) return false;
            if (v.stoppedSince > where.stoppedSince.lte) return false;
          }
          if (where.zoneId && v.zoneId !== where.zoneId) return false;
          return true;
        });
      }),
    },
  })),
}));

const { getStoppedVehicles, getVehiclesByZone, executeTool } = await import("../tools.js");

describe("getStoppedVehicles (DW-03)", () => {
  it("devuelve solo vehículos detenidos por más del umbral indicado (positivo)", async () => {
    const result = await getStoppedVehicles({ minMinutesStopped: 20 });
    expect(result.map((v: any) => v.vehicleId)).toEqual(["v-1"]);
  });

  it("excluye vehículos en movimiento (stoppedSince null) sin importar el umbral (negativo)", async () => {
    const result = await getStoppedVehicles({ minMinutesStopped: 0 });
    expect(result.map((v: any) => v.vehicleId)).not.toContain("v-3");
  });

  it("filtra además por zona cuando se especifica (positivo)", async () => {
    const result = await getStoppedVehicles({ minMinutesStopped: 1, zoneId: "zona-a" });
    expect(result.every((v: any) => v.vehicleId !== "v-3")).toBe(true);
  });
});

describe("getVehiclesByZone (DW-03)", () => {
  it("devuelve todos los vehículos de una zona, sin importar su estado (positivo)", async () => {
    const result = await getVehiclesByZone({ zoneId: "zona-a" });
    expect(result.map((v: any) => v.vehicleId).sort()).toEqual(["v-1", "v-2"]);
  });
});

describe("executeTool (despacho de tools por nombre)", () => {
  it("lanza un error para un nombre de tool desconocido (negativo — nunca debe ejecutar SQL arbitrario)", async () => {
    await expect(executeTool("dropAllTables", {})).rejects.toThrow(/Unknown tool/);
  });
});
