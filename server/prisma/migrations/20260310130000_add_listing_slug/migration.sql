ALTER TABLE "Listing"
ADD COLUMN "slug" TEXT;

DO $$
DECLARE
  listing_record RECORD;
  base_slug TEXT;
  candidate_slug TEXT;
  suffix_value INTEGER;
  suffix_text TEXT;
BEGIN
  FOR listing_record IN
    SELECT "id", "title"
    FROM "Listing"
    ORDER BY "id" ASC
  LOOP
    base_slug := lower(to_ascii(coalesce(listing_record."title", '')));
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '-{2,}', '-', 'g');
    base_slug := trim(both '-' from base_slug);

    IF base_slug = '' THEN
      base_slug := 'listing';
    ELSIF base_slug ~ '^[0-9]+(?:-[0-9]+)*$' THEN
      base_slug := 'listing-' || base_slug;
    END IF;

    base_slug := trim(both '-' from left(base_slug, 80));

    IF base_slug = '' THEN
      base_slug := 'listing';
    END IF;

    candidate_slug := base_slug;
    suffix_value := 2;

    WHILE EXISTS (
      SELECT 1
      FROM "Listing"
      WHERE "slug" = candidate_slug
    ) LOOP
      suffix_text := '-' || suffix_value::TEXT;
      candidate_slug := trim(both '-' from left(base_slug, 80 - char_length(suffix_text)));

      IF candidate_slug = '' THEN
        candidate_slug := 'listing';
      END IF;

      candidate_slug := candidate_slug || suffix_text;
      suffix_value := suffix_value + 1;
    END LOOP;

    UPDATE "Listing"
    SET "slug" = candidate_slug
    WHERE "id" = listing_record."id";
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Listing" WHERE "slug" IS NULL) THEN
    RAISE EXCEPTION 'Listing slug backfill failed';
  END IF;
END $$;

ALTER TABLE "Listing"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");
