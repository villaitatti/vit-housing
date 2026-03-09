-- AlterTable: role (single) -> roles (array)
ALTER TABLE "User" ADD COLUMN "roles" "Role"[] DEFAULT ARRAY['HOUSE_USER']::"Role"[];

-- Backfill: copy each user's existing single role into the new array column
UPDATE "User" SET "roles" = ARRAY["role"];

-- Drop the old single-value column
ALTER TABLE "User" DROP COLUMN "role";
