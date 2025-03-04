-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "up" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
