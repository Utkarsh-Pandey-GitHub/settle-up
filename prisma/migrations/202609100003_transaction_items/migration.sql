CREATE TABLE "TransactionItem" (
  "transactionId" UUID NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" >= 0 AND "position" < 100),
  "name" VARCHAR(120) NOT NULL CHECK (length(trim("name")) > 0),
  "quantity" DECIMAL(10,3) NOT NULL CHECK ("quantity" > 0),
  "amountMinor" BIGINT NOT NULL CHECK (abs("amountMinor") <= 1000000000000),
  CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("transactionId", "position"),
  CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
