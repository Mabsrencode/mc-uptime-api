/*
  Warnings:

  - You are about to drop the column `mobile_number` on the `Site` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Site_mobile_number_key";

-- AlterTable
ALTER TABLE "Site" DROP COLUMN "mobile_number";
