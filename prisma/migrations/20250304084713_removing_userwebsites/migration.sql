/*
  Warnings:

  - You are about to drop the `UserWebsites` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Site` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- DropTable
DROP TABLE "UserWebsites";
