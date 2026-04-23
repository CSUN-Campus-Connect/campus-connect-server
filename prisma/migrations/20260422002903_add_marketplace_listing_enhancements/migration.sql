-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('sale', 'rent', 'free');

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "listingType" "ListingType" NOT NULL DEFAULT 'sale',
ADD COLUMN     "meetupLocation" TEXT,
ADD COLUMN     "rentalDurationDays" INTEGER,
ADD COLUMN     "rentalPrice" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "MarketplaceListing_listingType_idx" ON "MarketplaceListing"("listingType");
