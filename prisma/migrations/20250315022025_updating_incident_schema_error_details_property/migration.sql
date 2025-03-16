/*
  Warnings:

  - You are about to drop the column `details` on the `Check` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `Check` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Check" DROP COLUMN "details",
DROP COLUMN "error";

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "details" TEXT,
ADD COLUMN     "error" TEXT;
