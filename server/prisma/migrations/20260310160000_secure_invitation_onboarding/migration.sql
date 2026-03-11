CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT lower(email)
    FROM "User"
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot lowercase User.email values because case-insensitive duplicates exist';
  END IF;
END $$;

UPDATE "User"
SET "email" = lower("email")
WHERE "email" <> lower("email");

UPDATE "Invitation"
SET "email" = lower("email")
WHERE "email" <> lower("email");

ALTER TABLE "Invitation"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "token_hash" TEXT;

UPDATE "Invitation"
SET "token_hash" = encode(digest("token", 'sha256'), 'hex');

ALTER TABLE "Invitation"
  ALTER COLUMN "token_hash" SET NOT NULL;

DROP INDEX "Invitation_token_key";

ALTER TABLE "Invitation"
  DROP COLUMN "token";

CREATE UNIQUE INDEX "Invitation_token_hash_key" ON "Invitation"("token_hash");
