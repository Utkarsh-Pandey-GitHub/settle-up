CREATE TABLE "GoogleIdentity" (
    "userId" UUID NOT NULL,
    "subject" VARCHAR(255) NOT NULL,

    CONSTRAINT "GoogleIdentity_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "GoogleIdentity_subject_key" ON "GoogleIdentity"("subject");

ALTER TABLE "GoogleIdentity"
ADD CONSTRAINT "GoogleIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
