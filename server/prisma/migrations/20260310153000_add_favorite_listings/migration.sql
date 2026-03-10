CREATE TABLE "FavoriteListing" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "listing_id" INTEGER NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FavoriteListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FavoriteListing_user_id_listing_id_key" ON "FavoriteListing"("user_id", "listing_id");
CREATE INDEX "FavoriteListing_user_id_idx" ON "FavoriteListing"("user_id");
CREATE INDEX "FavoriteListing_listing_id_idx" ON "FavoriteListing"("listing_id");

ALTER TABLE "FavoriteListing"
  ADD CONSTRAINT "FavoriteListing_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FavoriteListing"
  ADD CONSTRAINT "FavoriteListing_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
