/*
  Warnings:

  - Added the required column `email` to the `Site` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "email" TEXT NOT NULL;
