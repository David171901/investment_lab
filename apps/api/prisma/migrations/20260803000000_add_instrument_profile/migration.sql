-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "country" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "profileFetchedAt" TIMESTAMP(3),
ADD COLUMN     "sector" TEXT;

