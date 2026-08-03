-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "externalTicker" TEXT;

-- CreateTable
CREATE TABLE "Quote" (
    "instrumentId" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("instrumentId")
);

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
