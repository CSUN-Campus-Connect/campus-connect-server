-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('CRITICAL_RED', 'CRITICAL_BLUE', 'ALL_CLEAR_GREEN');

-- CreateEnum
CREATE TYPE "AnnouncementChannel" AS ENUM ('BANNER', 'PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "AnnouncementDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'PERMANENT_FAIL', 'SKIPPED');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "bannerBroadcastAt" TIMESTAMP(3),
ADD COLUMN     "channels" "AnnouncementChannel"[] DEFAULT ARRAY[]::"AnnouncementChannel"[],
ADD COLUMN     "deliveryCounts" JSONB,
ADD COLUMN     "endReason" TEXT,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "endedById" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "parentAnnouncementId" TEXT,
ADD COLUMN     "severity" "AnnouncementSeverity",
ADD COLUMN     "testMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emergencyAlertsOptIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expoPushToken" TEXT,
ADD COLUMN     "expoPushTokenUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "phoneNumber" TEXT;

-- CreateTable
CREATE TABLE "AnnouncementDelivery" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "AnnouncementChannel" NOT NULL,
    "status" "AnnouncementDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "providerReceiptId" TEXT,
    "failReason" TEXT,
    "fellBackToChannel" "AnnouncementChannel",
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementDelivery_status_nextRetryAt_idx" ON "AnnouncementDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "AnnouncementDelivery_announcementId_channel_status_idx" ON "AnnouncementDelivery"("announcementId", "channel", "status");

-- CreateIndex
CREATE INDEX "AnnouncementDelivery_providerMessageId_idx" ON "AnnouncementDelivery"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_userId_channel_key" ON "AnnouncementDelivery"("announcementId", "userId", "channel");

-- CreateIndex
CREATE INDEX "AnnouncementDismissal_userId_idx" ON "AnnouncementDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDismissal_announcementId_userId_key" ON "AnnouncementDismissal"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "Announcement_severity_isActive_idx" ON "Announcement"("severity", "isActive");

-- CreateIndex
CREATE INDEX "Announcement_parentAnnouncementId_idx" ON "Announcement"("parentAnnouncementId");

-- CreateIndex
CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_parentAnnouncementId_fkey" FOREIGN KEY ("parentAnnouncementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDismissal" ADD CONSTRAINT "AnnouncementDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
