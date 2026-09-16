ALTER TABLE "Transaction" ADD COLUMN "deletedAt" TIMESTAMPTZ;

CREATE INDEX "Transaction_sourceId_deletedAt_idx"
ON "Transaction"("sourceId", "deletedAt");
