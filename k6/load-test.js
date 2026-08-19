import http from "k6/http";
import { check, sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

/**
 * Simula ~300 vehículos enviando telemetría, con:
 * - 10% de peticiones duplicadas (mismo eventId reenviado)
 * - 5% de payloads inválidos (para verificar que van al dead-letter y no rompen el worker)
 *
 * Uso: k6 run --env API_URL=http://localhost:3000 k6/load-test.js
 */
export const options = {
  vus: 50,
  duration: "60s",
};

const API_URL = __ENV.API_URL || "http://localhost:3000";
const recentEventIds = [];

function randomVehicleId(vus) {
  return `vehicle-${Math.floor(Math.random() * 300)}`;
}

function buildValidPayload() {
  const eventId = uuidv4();
  recentEventIds.push(eventId);
  if (recentEventIds.length > 50) recentEventIds.shift();

  return {
    eventId,
    vehicleId: randomVehicleId(),
    lat: 4.6 + (Math.random() - 0.5) * 0.1,
    lng: -74.1 + (Math.random() - 0.5) * 0.1,
    speedKmh: Math.random() * 80,
    zoneId: Math.random() > 0.7 ? "zona-critica-1" : undefined,
    capturedAt: new Date().toISOString(),
  };
}

function buildDuplicatePayload() {
  if (recentEventIds.length === 0) return buildValidPayload();
  const eventId = recentEventIds[Math.floor(Math.random() * recentEventIds.length)];
  return {
    eventId,
    vehicleId: randomVehicleId(),
    lat: 4.6,
    lng: -74.1,
    capturedAt: new Date().toISOString(),
  };
}

function buildInvalidPayload() {
  // Payload deliberadamente malformado: falta vehicleId, lat fuera de rango.
  return {
    eventId: uuidv4(),
    lat: 999,
    lng: -74.1,
    capturedAt: "not-a-date",
  };
}

export default function () {
  const roll = Math.random();
  let payload;

  if (roll < 0.05) {
    payload = buildInvalidPayload(); // 5% inválidos
  } else if (roll < 0.15) {
    payload = buildDuplicatePayload(); // 10% duplicados
  } else {
    payload = buildValidPayload(); // 85% normales
  }

  const res = http.post(`${API_URL}/telemetry`, JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "status is 202 or 400": (r) => r.status === 202 || r.status === 400,
  });

  sleep(0.2);
}
