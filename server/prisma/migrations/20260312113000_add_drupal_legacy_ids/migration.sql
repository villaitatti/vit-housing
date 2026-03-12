ALTER TABLE "User"
ADD COLUMN "legacy_drupal_uid" INTEGER;

ALTER TABLE "Listing"
ADD COLUMN "legacy_drupal_nid" INTEGER;

CREATE UNIQUE INDEX "User_legacy_drupal_uid_key" ON "User"("legacy_drupal_uid");

CREATE UNIQUE INDEX "Listing_legacy_drupal_nid_key" ON "Listing"("legacy_drupal_nid");
