-- CreateEnum
CREATE TYPE "SundialNewsCategory" AS ENUM ('news', 'sports', 'culture', 'multimedia');

-- CreateTable
CREATE TABLE "SundialNews" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "category" "SundialNewsCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "link" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SundialNews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SundialNews_link_key" ON "SundialNews"("link");

-- CreateIndex
CREATE INDEX "SundialNews_category_idx" ON "SundialNews"("category");

-- CreateIndex
CREATE INDEX "SundialNews_createdAt_idx" ON "SundialNews"("createdAt" DESC);
