import { PrismaClient } from "@prisma/client";
import type { ToolDefinition } from "./providers/types.js";

/**
 * Ver skill `ai-agent-patterns`. Cada tool es una función típica, acotada y
 * parametrizada — NUNCA se deja que el modelo genere SQL libre. Este cliente
 * Prisma debería apuntar a credenciales de solo lectura en un entorno real
 * (documentar esto en el README si no se llega a configurar en la prueba).
 *
 * Formato neutral (ToolDefinition), independiente del proveedor — cada
 * provider (Ollama/OpenAI) lo traduce a su propio formato de API. Ver
 * providers/types.ts.
 */
export const prisma = new PrismaClient();

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "getStoppedVehicles",
    description:
      "Devuelve los vehículos que llevan detenidos más del número de minutos indicado, opcionalmente filtrados por zona.",
    parameters: {
      type: "object",
      properties: {
        minMinutesStopped: { type: "number", description: "Minutos mínimos detenido" },
        zoneId: { type: "string", description: "Identificador de zona crítica (opcional)" },
      },
      required: ["minMinutesStopped"],
    },
  },
  {
    name: "getVehiclesByZone",
    description: "Devuelve todos los vehículos actualmente ubicados en una zona dada.",
    parameters: {
      type: "object",
      properties: {
        zoneId: { type: "string", description: "Identificador de zona" },
      },
      required: ["zoneId"],
    },
  },
];

export async function getStoppedVehicles(args: { minMinutesStopped: number; zoneId?: string }) {
  const thresholdMs = args.minMinutesStopped * 60_000;
  const cutoff = new Date(Date.now() - thresholdMs);

  return prisma.vehicleStatus.findMany({
    where: {
      stoppedSince: { not: null, lte: cutoff },
      ...(args.zoneId ? { zoneId: args.zoneId } : {}),
    },
    select: { vehicleId: true, zoneId: true, stoppedSince: true, lastLat: true, lastLng: true },
  });
}

export async function getVehiclesByZone(args: { zoneId: string }) {
  return prisma.vehicleStatus.findMany({
    where: { zoneId: args.zoneId },
    select: { vehicleId: true, lastLat: true, lastLng: true, stoppedSince: true },
  });
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "getStoppedVehicles":
      return getStoppedVehicles(args as { minMinutesStopped: number; zoneId?: string });
    case "getVehiclesByZone":
      return getVehiclesByZone(args as { zoneId: string });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
