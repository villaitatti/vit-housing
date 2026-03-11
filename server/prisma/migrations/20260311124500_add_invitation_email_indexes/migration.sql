WITH ranked_invitations AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY email
      ORDER BY created_at DESC, id DESC
    ) AS row_num
  FROM "Invitation"
  WHERE "used" = false
    AND "revoked_at" IS NULL
)
UPDATE "Invitation"
SET "revoked_at" = NOW()
WHERE id IN (
  SELECT id
  FROM ranked_invitations
  WHERE row_num > 1
);

CREATE INDEX IF NOT EXISTS "Invitation_email_used_revoked_at_expires_at_idx"
  ON "Invitation"("email", "used", "revoked_at", "expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_active_email_key"
  ON "Invitation"("email")
  WHERE "used" = false
    AND "revoked_at" IS NULL;
