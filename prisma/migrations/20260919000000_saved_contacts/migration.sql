-- Preserve names assigned to pending users before removing the duplicate contact store.
UPDATE "UserProfile" AS profile
SET "name" = names."name"
FROM (
  SELECT "linkedUserId", MIN("name") AS "name"
  FROM "ContactPeer"
  WHERE "linkedUserId" IS NOT NULL
  GROUP BY "linkedUserId"
) AS names
JOIN "PhoneIdentity" AS phone ON phone."userId" = names."linkedUserId"
WHERE profile."userId" = names."linkedUserId"
  AND profile."name" = 'New friend'
  AND phone."verifiedAt" IS NULL;

DROP TABLE "ContactPeer";

-- Bill images are processed once and are no longer stored by SettleUp.
DROP TABLE IF EXISTS "Attachment";
