/*
  Warnings:

  - A unique constraint covering the columns `[url]` on the table `Event` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Event_url_key" ON "Event"("url");
