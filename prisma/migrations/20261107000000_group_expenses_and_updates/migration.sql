ALTER TABLE "Transaction" ADD COLUMN "createdById" UUID;
UPDATE "Transaction" SET "createdById" = "sourceId";
ALTER TABLE "Transaction" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "Transaction_sourceId_idempotencyKey_key";
CREATE UNIQUE INDEX "Transaction_createdById_idempotencyKey_key"
  ON "Transaction"("createdById", "idempotencyKey");

ALTER TABLE "LedgerActivity" ADD COLUMN "subjectId" UUID;
UPDATE "LedgerActivity" AS activity
SET "subjectId" = (
  SELECT (array_agg(event."resourceId"))[1] FROM "AuditEvent" AS event
  WHERE event."actorId" = activity."actorId"
    AND event."action" = activity."event"
    AND event."createdAt" = activity."createdAt"
    AND event."detail"->>'groupId' = (
      SELECT ledger."groupId"::text FROM "Ledger" AS ledger WHERE ledger.id = activity."ledgerId"
    )
    AND (activity."event" <> 'GROUP_MEMBER_ADDED'
      OR activity."message" = (
        SELECT profile."name" FROM "UserProfile" AS profile
        WHERE profile."userId" = event."resourceId"
      ) || ' joined the group')
  HAVING count(*) = 1
)
WHERE activity."event" IN ('GROUP_MEMBER_ADDED', 'GROUP_MEMBER_REMOVED');

UPDATE "Ledger" AS ledger
SET "updatedAt" = GREATEST(ledger."updatedAt", activity.last_change)
FROM (
  SELECT "ledgerId", MAX("createdAt") AS last_change
  FROM "LedgerActivity" GROUP BY "ledgerId"
) AS activity
WHERE ledger.id = activity."ledgerId";

CREATE TABLE "DashboardRevision" (
  "userId" UUID PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "revision" UUID NOT NULL
);
ALTER TABLE "DashboardRevision" ENABLE ROW LEVEL SECURITY;

-- A single revision per recipient coalesces updates and survives disconnects.
CREATE FUNCTION settleup_queue_dashboard_updates(recipients UUID[]) RETURNS void
LANGUAGE sql SET search_path FROM CURRENT AS $$
  INSERT INTO "DashboardRevision" ("userId", "revision")
  SELECT id, gen_random_uuid()
  FROM (SELECT DISTINCT unnest(recipients) AS id) AS users
  ORDER BY id
  ON CONFLICT ("userId") DO UPDATE SET "revision" = EXCLUDED."revision";
$$;

CREATE FUNCTION settleup_group_activity_update() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  UPDATE "Ledger" SET "updatedAt" = GREATEST("updatedAt", NEW."createdAt")
  WHERE id = NEW."ledgerId";
  PERFORM settleup_queue_dashboard_updates(ARRAY(
    SELECT "userId" FROM "LedgerMember"
    WHERE "ledgerId" = NEW."ledgerId" AND "leftAt" IS NULL
    UNION SELECT NEW."actorId"
    UNION SELECT NEW."subjectId" WHERE NEW."subjectId" IS NOT NULL
  ));
  RETURN NEW;
END;
$$;
CREATE TRIGGER settleup_group_activity_update AFTER INSERT ON "LedgerActivity"
FOR EACH ROW EXECUTE FUNCTION settleup_group_activity_update();

CREATE FUNCTION settleup_profile_update() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  PERFORM settleup_queue_dashboard_updates(ARRAY(
    SELECT NEW."userId"
    UNION SELECT peer."userId" FROM "LedgerMember" AS mine
      JOIN "LedgerMember" AS peer ON peer."ledgerId" = mine."ledgerId"
      WHERE mine."userId" = NEW."userId" AND mine."leftAt" IS NULL
        AND peer."leftAt" IS NULL
    UNION SELECT "ownerId" FROM "ContactPreference"
      WHERE "contactId" = NEW."userId" AND "hiddenAt" IS NULL
    UNION SELECT peer."userId" FROM "TransactionParticipant" AS mine
      JOIN "TransactionParticipant" AS peer ON peer."transactionId" = mine."transactionId"
      JOIN "Transaction" AS record ON record.id = mine."transactionId"
      WHERE mine."userId" = NEW."userId" AND record."deletedAt" IS NULL
  ));
  RETURN NEW;
END;
$$;
CREATE TRIGGER settleup_profile_update AFTER UPDATE OF "name", "avatar" ON "UserProfile"
FOR EACH ROW WHEN (OLD."name" IS DISTINCT FROM NEW."name" OR OLD."avatar" IS DISTINCT FROM NEW."avatar")
EXECUTE FUNCTION settleup_profile_update();
