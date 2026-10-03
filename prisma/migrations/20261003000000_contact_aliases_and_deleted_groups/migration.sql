ALTER TABLE "Group" ADD COLUMN "deletedAt" TIMESTAMPTZ;
ALTER TABLE "PhoneIdentity" ADD COLUMN "changedAt" TIMESTAMPTZ;

CREATE TABLE "ContactPreference" (
  "ownerId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "alias" VARCHAR(100),
  "hiddenAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ContactPreference_pkey" PRIMARY KEY ("ownerId", "contactId")
);

CREATE INDEX "ContactPreference_ownerId_hiddenAt_idx"
  ON "ContactPreference"("ownerId", "hiddenAt");

ALTER TABLE "ContactPreference"
  ADD CONSTRAINT "ContactPreference_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactPreference"
  ADD CONSTRAINT "ContactPreference_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Group_deletedAt_idx" ON "Group"("deletedAt");
CREATE INDEX "UserBlock_blockedId_blockerId_idx"
  ON "UserBlock"("blockedId", "blockerId");
