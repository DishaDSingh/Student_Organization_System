-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "streamUrl" TEXT,
    "playbackUrl" TEXT,
    "eventId" TEXT,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CameraAccess" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CameraAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Camera_eventId_idx" ON "Camera"("eventId");

-- CreateIndex
CREATE INDEX "CameraAccess_cameraId_createdAt_idx" ON "CameraAccess"("cameraId", "createdAt");

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CameraAccess" ADD CONSTRAINT "CameraAccess_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

