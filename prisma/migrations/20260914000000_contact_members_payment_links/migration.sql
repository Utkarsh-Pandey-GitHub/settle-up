ALTER TABLE "PhoneIdentity" ALTER COLUMN "verifiedAt" DROP NOT NULL;
CREATE TABLE "PaymentLink" (
  "tokenDigest" CHAR(64) PRIMARY KEY,
  "ownerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "uri" VARCHAR(2048) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "PaymentLink_expiresAt_idx" ON "PaymentLink"("expiresAt");
