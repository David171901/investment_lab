-- CreateTable
CREATE TABLE "CandleCache" (
    "instrumentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandleCache_pkey" PRIMARY KEY ("instrumentId")
);

-- AddForeignKey
ALTER TABLE "CandleCache" ADD CONSTRAINT "CandleCache_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
