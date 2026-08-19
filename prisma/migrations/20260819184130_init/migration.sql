-- CreateTable
CREATE TABLE "telemetry_events" (
    "eventId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION,
    "zoneId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "vehicle_status" (
    "vehicleId" TEXT NOT NULL,
    "lastLat" DOUBLE PRECISION NOT NULL,
    "lastLng" DOUBLE PRECISION NOT NULL,
    "zoneId" TEXT,
    "lastMovedAt" TIMESTAMP(3) NOT NULL,
    "stoppedSince" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_status_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateIndex
CREATE INDEX "telemetry_events_vehicleId_capturedAt_idx" ON "telemetry_events"("vehicleId", "capturedAt");

-- CreateIndex
CREATE INDEX "telemetry_events_zoneId_idx" ON "telemetry_events"("zoneId");

-- CreateIndex
CREATE INDEX "vehicle_status_zoneId_idx" ON "vehicle_status"("zoneId");
