-- AlterTable
ALTER TABLE "User" ADD COLUMN "pending_email" TEXT,
ADD COLUMN "email_change_token_hash" TEXT,
ADD COLUMN "email_change_expires_at" TIMESTAMP(3),
ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
