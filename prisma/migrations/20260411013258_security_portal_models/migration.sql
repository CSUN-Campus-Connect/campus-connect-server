-- CreateEnum
CREATE TYPE "SecurityReportType" AS ENUM ('CRIMINAL', 'SAFETY_HAZARD', 'DISCRIMINATION', 'SEXUAL_VIOLENCE', 'MISCONDUCT', 'ACADEMIC_DISHONESTY', 'DISTURBANCE', 'SUSPICIOUS_ACTIVITY', 'ESCORT_REQUEST', 'LOST_FOUND', 'PARKING', 'ANONYMOUS_TIP', 'MENTAL_HEALTH');

-- CreateEnum
CREATE TYPE "SecurityUrgency" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'TIME_SENSITIVE');

-- CreateEnum
CREATE TYPE "SecurityStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'INVESTIGATION', 'ESCALATED', 'PENDING_RESOLUTION', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "SecurityDepartment" AS ENUM ('DPS', 'OEC', 'OSCED', 'HOUSING', 'UCS', 'PARKING', 'PHYSICAL_PLANT');

-- CreateEnum
CREATE TYPE "ReporterRelationship" AS ENUM ('VICTIM', 'WITNESS', 'BYSTANDER', 'ON_BEHALF_OF');

-- CreateEnum
CREATE TYPE "CleryGeography" AS ENUM ('ON_CAMPUS', 'ON_CAMPUS_RESIDENTIAL', 'NON_CAMPUS', 'PUBLIC_PROPERTY');

-- CreateEnum
CREATE TYPE "SecurityMessageRole" AS ENUM ('REPORTER', 'HANDLER', 'INVESTIGATOR', 'SUPERVISOR');

-- CreateTable
CREATE TABLE "SecurityReport" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "reporterId" TEXT,
    "reportType" "SecurityReportType" NOT NULL,
    "urgency" "SecurityUrgency" NOT NULL,
    "status" "SecurityStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "anonymousToken" TEXT,
    "assignedDepartment" "SecurityDepartment" NOT NULL,
    "assignedToId" TEXT,
    "parentReportId" TEXT,
    "reporterRelationship" "ReporterRelationship" NOT NULL DEFAULT 'VICTIM',
    "cleryGeography" "CleryGeography",
    "resolvedAt" TIMESTAMP(3),
    "resolutionSummary" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEvidence" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "description" TEXT,
    "isRedacted" BOOLEAN NOT NULL DEFAULT false,
    "checksumSha256" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportStatusHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMessage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "SecurityMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportInvolvedParty" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "affiliation" TEXT,
    "relationToReporter" TEXT,

    CONSTRAINT "ReportInvolvedParty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityReport_caseNumber_key" ON "SecurityReport"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityReport_anonymousToken_key" ON "SecurityReport"("anonymousToken");

-- CreateIndex
CREATE INDEX "SecurityReport_status_idx" ON "SecurityReport"("status");

-- CreateIndex
CREATE INDEX "SecurityReport_assignedDepartment_idx" ON "SecurityReport"("assignedDepartment");

-- CreateIndex
CREATE INDEX "SecurityReport_reporterId_idx" ON "SecurityReport"("reporterId");

-- CreateIndex
CREATE INDEX "SecurityReport_assignedToId_idx" ON "SecurityReport"("assignedToId");

-- CreateIndex
CREATE INDEX "SecurityReport_urgency_idx" ON "SecurityReport"("urgency");

-- CreateIndex
CREATE INDEX "SecurityReport_createdAt_idx" ON "SecurityReport"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SecurityReport_caseNumber_idx" ON "SecurityReport"("caseNumber");

-- CreateIndex
CREATE INDEX "ReportEvidence_reportId_idx" ON "ReportEvidence"("reportId");

-- CreateIndex
CREATE INDEX "ReportStatusHistory_reportId_idx" ON "ReportStatusHistory"("reportId");

-- CreateIndex
CREATE INDEX "ReportStatusHistory_createdAt_idx" ON "ReportStatusHistory"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReportMessage_reportId_createdAt_idx" ON "ReportMessage"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportInvolvedParty_reportId_idx" ON "ReportInvolvedParty"("reportId");

-- AddForeignKey
ALTER TABLE "SecurityReport" ADD CONSTRAINT "SecurityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityReport" ADD CONSTRAINT "SecurityReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityReport" ADD CONSTRAINT "SecurityReport_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "SecurityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SecurityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStatusHistory" ADD CONSTRAINT "ReportStatusHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SecurityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMessage" ADD CONSTRAINT "ReportMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SecurityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportInvolvedParty" ADD CONSTRAINT "ReportInvolvedParty_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SecurityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
