import { describe, it, expect } from "vitest";
import { rawTelemetrySchema, validatedTelemetrySchema, telemetryBatchSchema } from "../schemas.js";

/**
 * Base de todas las HU de telemetría (DW-01, DM-01, DM-02): si esta
 * validación falla en silencio, todo lo que depende de ella (ingesta,
 * dashboard, sync offline) queda comprometido.
 */
describe("rawTelemetrySchema", () => {
  const valid = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    vehicleId: "v-1",
    lat: 4.6,
    lng: -74.1,
    capturedAt: new Date().toISOString(),
  };

  it("accepts a well-formed event (positivo)", () => {
    expect(rawTelemetrySchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional speedKmh and zoneId when present", () => {
    const result = rawTelemetrySchema.safeParse({ ...valid, speedKmh: 42.5, zoneId: "zona-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID eventId (negativo)", () => {
    expect(rawTelemetrySchema.safeParse({ ...valid, eventId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a missing vehicleId (negativo)", () => {
    const { vehicleId, ...withoutVehicleId } = valid;
    expect(rawTelemetrySchema.safeParse(withoutVehicleId).success).toBe(false);
  });

  it("rejects a non-datetime capturedAt (negativo)", () => {
    expect(rawTelemetrySchema.safeParse({ ...valid, capturedAt: "yesterday" }).success).toBe(false);
  });

  it("rejects negative speedKmh (negativo)", () => {
    expect(rawTelemetrySchema.safeParse({ ...valid, speedKmh: -5 }).success).toBe(false);
  });
});

describe("validatedTelemetrySchema (reglas de negocio, aplicadas en el worker)", () => {
  const valid = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    vehicleId: "v-1",
    lat: 4.6,
    lng: -74.1,
    capturedAt: new Date().toISOString(),
  };

  it("accepts coordinates within valid range (positivo)", () => {
    expect(validatedTelemetrySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects latitude out of range, e.g. 999 (negativo — este es exactamente el payload que inyecta k6/load-test.js)", () => {
    expect(validatedTelemetrySchema.safeParse({ ...valid, lat: 999 }).success).toBe(false);
  });

  it("rejects longitude out of range (negativo)", () => {
    expect(validatedTelemetrySchema.safeParse({ ...valid, lng: -200 }).success).toBe(false);
  });
});

describe("telemetryBatchSchema (usado por POST /telemetry/batch, app móvil — DM-02, DM-03)", () => {
  const event = {
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    vehicleId: "v-1",
    lat: 4.6,
    lng: -74.1,
    capturedAt: new Date().toISOString(),
  };

  it("accepts a batch with 1 to 500 events (positivo)", () => {
    expect(telemetryBatchSchema.safeParse({ events: [event] }).success).toBe(true);
  });

  it("rejects an empty batch (negativo)", () => {
    expect(telemetryBatchSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it("rejects a batch over 500 events (negativo)", () => {
    const events = Array.from({ length: 501 }, (_, i) => ({ ...event, eventId: crypto.randomUUID() }));
    expect(telemetryBatchSchema.safeParse({ events }).success).toBe(false);
  });
});
