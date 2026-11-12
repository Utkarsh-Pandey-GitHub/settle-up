ALTER TABLE "Goal"
ADD COLUMN "dailyLimitMinor" BIGINT,
ADD COLUMN "weeklyLimitMinor" BIGINT,
ADD COLUMN "monthlyLimitMinor" BIGINT,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
