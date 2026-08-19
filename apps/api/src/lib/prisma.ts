import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma de la API, usado solo para lecturas (p. ej. el drawer de
 * detalle de vehículo, DW-04). En un despliegue real esto debería apuntar a
 * credenciales de solo lectura — mismo pendiente ya documentado en
 * apps/ai-agent/src/tools.ts, no se llega a configurar en el alcance de esta prueba.
 */
export const prisma = new PrismaClient();
