/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Site` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Site` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Site` table. All the data in the column will be lost.
  - You are about to drop the `UserWebsites` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Site" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId";

-- DropTable
DROP TABLE "UserWebsites";
