import { describe, it, expect } from "vitest";
import { distanceKm, formatDuration } from "../lib/geo.js";

/**
 * Lógica pura (sin importar "react-native") — se puede probar con Vitest
 * sin fricción. Ver README.md, sección de testing, para por qué las
 * pantallas/componentes RN no se prueban aquí (requieren el transform Flow
 * de Metro/jest-expo, incompatible con el pipeline de Vitest de este monorepo).
 */
describe("distanceKm", () => {
  it("devuelve ~0 para el mismo punto (positivo)", () => {
    expect(distanceKm({ lat: 4.6, lng: -74.1 }, { lat: 4.6, lng: -74.1 })).toBeCloseTo(0, 5);
  });

  it("devuelve una distancia positiva coherente entre dos puntos conocidos (positivo)", () => {
    // Bogotá (4.6097, -74.0817) -> Medellín (6.2442, -75.5812), ~245km reales
    const km = distanceKm({ lat: 4.6097, lng: -74.0817 }, { lat: 6.2442, lng: -75.5812 });
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(280);
  });
});

describe("formatDuration", () => {
  it("formatea milisegundos como HH:MM (positivo)", () => {
    expect(formatDuration(90 * 60 * 1000)).toBe("01:30");
  });

  it("no falla ni devuelve negativo con 0ms (negativo/borde)", () => {
    expect(formatDuration(0)).toBe("00:00");
  });
});
