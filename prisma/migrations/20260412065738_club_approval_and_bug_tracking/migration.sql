-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- AlterTable
ALTER TABLE "BugReport" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "reportStatus" "BugReportStatus" NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "ClubStatus" NOT NULL DEFAULT 'pending';

-- Set existing clubs to approved
UPDATE "Club" SET "status" = 'approved';

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
