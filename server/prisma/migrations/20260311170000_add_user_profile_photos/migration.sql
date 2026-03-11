ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "profile_photo_path" TEXT,
ADD COLUMN IF NOT EXISTS "profile_photo_url" TEXT;
