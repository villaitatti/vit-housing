-- AlterTable: make invited_by nullable
ALTER TABLE "Invitation" ALTER COLUMN "invited_by" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_invited_by_fkey";

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
