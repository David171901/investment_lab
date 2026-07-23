-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "externalId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Operation_externalId_key" ON "Operation"("externalId");

