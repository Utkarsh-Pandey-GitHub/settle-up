-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PERSONAL_EXPENSE', 'SHARED_EXPENSE', 'LOAN', 'LOAN_REPAYMENT', 'SETTLEMENT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SETTLED', 'DISPUTED', 'REVERSED', 'PENDING_LOAN');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254),
    "avatar" VARCHAR(500),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "discoverable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PhoneIdentity" (
    "userId" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "verifiedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PhoneIdentity_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "digest" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "refreshDigest" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "rotatedAt" TIMESTAMPTZ,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactPeer" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "linkedUserId" UUID,
    "inviteDigest" TEXT,
    "inviteExpiresAt" TIMESTAMPTZ,

    CONSTRAINT "ContactPeer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerMember" (
    "ledgerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "leftAt" TIMESTAMPTZ,

    CONSTRAINT "LedgerMember_pkey" PRIMARY KEY ("ledgerId","userId")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "destinationId" UUID,
    "ledgerId" UUID,
    "title" VARCHAR(120) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "notes" VARCHAR(2000),
    "icon" VARCHAR(16),
    "paymentReference" VARCHAR(128),
    "idempotencyKey" UUID NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "correctsId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionParticipant" (
    "transactionId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "TransactionParticipant_pkey" PRIMARY KEY ("transactionId","userId")
);

-- CreateTable
CREATE TABLE "ExpenseSplit" (
    "transactionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "weight" BIGINT,

    CONSTRAINT "ExpenseSplit_pkey" PRIMARY KEY ("transactionId","userId")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "ledgerId" UUID NOT NULL,
    "debtorId" UUID NOT NULL,
    "creditorId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "remainingMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "obligationId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "archivedAt" TIMESTAMPTZ,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTag" (
    "transactionId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "TransactionTag_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateTable
CREATE TABLE "LedgerActivity" (
    "id" UUID NOT NULL,
    "ledgerId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "event" VARCHAR(50) NOT NULL,
    "message" VARCHAR(250) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "openedBy" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "previousStatus" "TransactionStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMPTZ,
    "resolution" VARCHAR(1000),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "start" TIMESTAMPTZ NOT NULL,
    "end" TIMESTAMPTZ NOT NULL,
    "thresholds" INTEGER[] DEFAULT ARRAY[50, 80, 100]::INTEGER[],
    "notifiedThresholds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalScope" (
    "id" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "tagId" UUID,
    "ledgerId" UUID,

    CONSTRAINT "GoalScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsImportRecord" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "decision" VARCHAR(10) NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SmsImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedAnalyticsLink" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "privatePhone" VARCHAR(16),
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedAnalyticsLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedAnalyticsSnapshot" (
    "linkId" UUID NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "SharedAnalyticsSnapshot_pkey" PRIMARY KEY ("linkId")
);

-- CreateTable
CREATE TABLE "SharedLinkAccessEvent" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedLinkAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" VARCHAR(50) NOT NULL,
    "size" INTEGER NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'QUARANTINED',

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "goals" BOOLEAN NOT NULL DEFAULT false,
    "activity" BOOLEAN NOT NULL DEFAULT false,
    "pushToken" TEXT,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationJob" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "message" VARCHAR(250) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneIdentity_phone_key" ON "PhoneIdentity"("phone");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_createdAt_idx" ON "OtpChallenge"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_refreshDigest_key" ON "DeviceSession"("refreshDigest");

-- CreateIndex
CREATE INDEX "DeviceSession_userId_revokedAt_idx" ON "DeviceSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "DeviceSession_familyId_idx" ON "DeviceSession"("familyId");

-- CreateIndex
CREATE INDEX "DeviceSession_expiresAt_idx" ON "DeviceSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactPeer_inviteDigest_key" ON "ContactPeer"("inviteDigest");

-- CreateIndex
CREATE UNIQUE INDEX "ContactPeer_ownerId_phone_key" ON "ContactPeer"("ownerId", "phone");

-- CreateIndex
CREATE INDEX "GroupMember_userId_leftAt_idx" ON "GroupMember"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "LedgerMember_userId_leftAt_idx" ON "LedgerMember"("userId", "leftAt");

-- CreateIndex
CREATE INDEX "Transaction_sourceId_occurredAt_idx" ON "Transaction"("sourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_destinationId_occurredAt_idx" ON "Transaction"("destinationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_ledgerId_occurredAt_idx" ON "Transaction"("ledgerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_currency_status_occurredAt_idx" ON "Transaction"("currency", "status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_sourceId_idempotencyKey_key" ON "Transaction"("sourceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TransactionParticipant_userId_idx" ON "TransactionParticipant"("userId");

-- CreateIndex
CREATE INDEX "Obligation_ledgerId_debtorId_creditorId_currency_idx" ON "Obligation"("ledgerId", "debtorId", "creditorId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_transactionId_debtorId_creditorId_key" ON "Obligation"("transactionId", "debtorId", "creditorId");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_transactionId_obligationId_key" ON "Settlement"("transactionId", "obligationId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_name_key" ON "Tag"("ownerId", "name");

-- CreateIndex
CREATE INDEX "TransactionTag_tagId_idx" ON "TransactionTag"("tagId");

-- CreateIndex
CREATE INDEX "LedgerActivity_ledgerId_createdAt_idx" ON "LedgerActivity"("ledgerId", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_transactionId_resolvedAt_idx" ON "Dispute"("transactionId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Goal_ownerId_end_idx" ON "Goal"("ownerId", "end");

-- CreateIndex
CREATE INDEX "SmsImportRecord_expiresAt_idx" ON "SmsImportRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsImportRecord_ownerId_fingerprint_key" ON "SmsImportRecord"("ownerId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "SharedAnalyticsLink_tokenDigest_key" ON "SharedAnalyticsLink"("tokenDigest");

-- CreateIndex
CREATE INDEX "SharedAnalyticsLink_expiresAt_idx" ON "SharedAnalyticsLink"("expiresAt");

-- CreateIndex
CREATE INDEX "SharedAnalyticsLink_ownerId_idx" ON "SharedAnalyticsLink"("ownerId");

-- CreateIndex
CREATE INDEX "SharedLinkAccessEvent_linkId_createdAt_idx" ON "SharedLinkAccessEvent"("linkId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_objectKey_key" ON "Attachment"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationJob_key_key" ON "NotificationJob"("key");

-- CreateIndex
CREATE INDEX "NotificationJob_deliveredAt_createdAt_idx" ON "NotificationJob"("deliveredAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceId_createdAt_idx" ON "AuditEvent"("resourceId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneIdentity" ADD CONSTRAINT "PhoneIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPeer" ADD CONSTRAINT "ContactPeer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPeer" ADD CONSTRAINT "ContactPeer_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerMember" ADD CONSTRAINT "LedgerMember_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerMember" ADD CONSTRAINT "LedgerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionParticipant" ADD CONSTRAINT "TransactionParticipant_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionParticipant" ADD CONSTRAINT "TransactionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "ExpenseSplit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTag" ADD CONSTRAINT "TransactionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerActivity" ADD CONSTRAINT "LedgerActivity_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalScope" ADD CONSTRAINT "GoalScope_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalScope" ADD CONSTRAINT "GoalScope_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalScope" ADD CONSTRAINT "GoalScope_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsImportRecord" ADD CONSTRAINT "SmsImportRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedAnalyticsLink" ADD CONSTRAINT "SharedAnalyticsLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedAnalyticsSnapshot" ADD CONSTRAINT "SharedAnalyticsSnapshot_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SharedAnalyticsLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedLinkAccessEvent" ADD CONSTRAINT "SharedLinkAccessEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SharedAnalyticsLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain invariants are also enforced below the service layer.
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_positive_minor" CHECK ("amountMinor" > 0 AND "amountMinor" <= 1000000000000);
ALTER TABLE "ExpenseSplit" ADD CONSTRAINT "split_nonnegative" CHECK ("amountMinor" >= 0);
ALTER TABLE "Obligation" ADD CONSTRAINT "obligation_pair" CHECK ("debtorId" <> "creditorId");
ALTER TABLE "Obligation" ADD CONSTRAINT "obligation_amounts" CHECK ("amountMinor" > 0 AND "remainingMinor" >= 0 AND "remainingMinor" <= "amountMinor");
ALTER TABLE "Settlement" ADD CONSTRAINT "settlement_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "Goal" ADD CONSTRAINT "goal_period" CHECK ("end" > "start" AND "amountMinor" > 0);
ALTER TABLE "GoalScope" ADD CONSTRAINT "goal_scope_one" CHECK (("tagId" IS NOT NULL)::int + ("ledgerId" IS NOT NULL)::int = 1);
ALTER TABLE "Attachment" ADD CONSTRAINT "attachment_size" CHECK ("size" > 0 AND "size" <= 10485760);
CREATE UNIQUE INDEX "one_open_dispute" ON "Dispute" ("transactionId") WHERE "resolvedAt" IS NULL;
CREATE UNIQUE INDEX "one_reversal_per_record" ON "Transaction" ("correctsId") WHERE "type" = 'REVERSAL';
