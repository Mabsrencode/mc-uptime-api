/*
  Warnings:

  - A unique constraint covering the columns `[mobile_number]` on the table `Site` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "mobile_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Site_mobile_number_key" ON "Site"("mobile_number");
