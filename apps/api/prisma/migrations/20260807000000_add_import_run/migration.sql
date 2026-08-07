-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('OK', 'FAILED');

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationsBefore" INTEGER NOT NULL,
    "operationsAfter" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,
    "status" "ImportStatus" NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

