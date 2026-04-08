/*
  Warnings:

  - Added the required column `source` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('src', 'usu', 'general');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "source" "SourceType" NOT NULL,
ADD COLUMN     "url" TEXT;
