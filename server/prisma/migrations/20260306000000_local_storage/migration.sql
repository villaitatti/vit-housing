-- Rename S3 columns to local storage columns
ALTER TABLE "ListingPhoto" RENAME COLUMN "s3_key" TO "file_path";
ALTER TABLE "ListingPhoto" RENAME COLUMN "s3_url" TO "url";
