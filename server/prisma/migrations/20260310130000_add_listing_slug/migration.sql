ALTER TABLE "Listing"
ADD COLUMN "slug" TEXT;

-- Keep this SQL function aligned with normalizeListingTitleToSlug in
-- server/src/services/listingSlug.service.ts so migration backfills match
-- runtime slug generation semantics.
CREATE OR REPLACE FUNCTION listing_slug_normalize(input_title TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_value TEXT := lower(coalesce(input_title, ''));
BEGIN
  normalized_value := replace(normalized_value, 'ß', 'ss');
  normalized_value := replace(normalized_value, 'æ', 'ae');
  normalized_value := replace(normalized_value, 'œ', 'oe');
  normalized_value := replace(normalized_value, 'ø', 'o');
  normalized_value := replace(normalized_value, 'đ', 'd');
  normalized_value := replace(normalized_value, 'ð', 'd');
  normalized_value := replace(normalized_value, 'ł', 'l');
  normalized_value := replace(normalized_value, 'þ', 'th');
  normalized_value := replace(normalized_value, 'ħ', 'h');
  normalized_value := replace(normalized_value, 'ı', 'i');

  normalized_value := regexp_replace(normalized_value, '[àáâãäåāăąǎǻȁȃȧạảấầẩẫậắằẳẵặ]', 'a', 'g');
  normalized_value := regexp_replace(normalized_value, '[çćĉċč]', 'c', 'g');
  normalized_value := regexp_replace(normalized_value, '[ď]', 'd', 'g');
  normalized_value := regexp_replace(normalized_value, '[èéêëēĕėęěȅȇẹẻẽếềểễệ]', 'e', 'g');
  normalized_value := regexp_replace(normalized_value, '[ĝğġģ]', 'g', 'g');
  normalized_value := regexp_replace(normalized_value, '[ĥ]', 'h', 'g');
  normalized_value := regexp_replace(normalized_value, '[ìíîïĩīĭįǐȉȋịỉ]', 'i', 'g');
  normalized_value := regexp_replace(normalized_value, '[ĵ]', 'j', 'g');
  normalized_value := regexp_replace(normalized_value, '[ķ]', 'k', 'g');
  normalized_value := regexp_replace(normalized_value, '[ĺļľŀ]', 'l', 'g');
  normalized_value := regexp_replace(normalized_value, '[ñńņň]', 'n', 'g');
  normalized_value := regexp_replace(normalized_value, '[òóôõöōŏőǒȍȏọỏốồổỗộớờởỡợ]', 'o', 'g');
  normalized_value := regexp_replace(normalized_value, '[ŕŗř]', 'r', 'g');
  normalized_value := regexp_replace(normalized_value, '[śŝşšș]', 's', 'g');
  normalized_value := regexp_replace(normalized_value, '[ťţ]', 't', 'g');
  normalized_value := regexp_replace(normalized_value, '[ùúûüũūŭůűųǔȕȗụủứừửữự]', 'u', 'g');
  normalized_value := regexp_replace(normalized_value, '[ŵ]', 'w', 'g');
  normalized_value := regexp_replace(normalized_value, '[ýÿŷỳỵỷỹ]', 'y', 'g');
  normalized_value := regexp_replace(normalized_value, '[źżž]', 'z', 'g');

  normalized_value := trim(both '-' from regexp_replace(regexp_replace(normalized_value, '[^a-z0-9]+', '-', 'g'), '-{2,}', '-', 'g'));

  IF normalized_value = '' THEN
    normalized_value := 'listing';
  ELSIF normalized_value ~ '^[0-9]+(?:-[0-9]+)*$' THEN
    normalized_value := 'listing-' || normalized_value;
  END IF;

  normalized_value := trim(both '-' from regexp_replace(left(normalized_value, 80), '-+$', ''));

  IF normalized_value = '' THEN
    normalized_value := 'listing';
  END IF;

  RETURN normalized_value;
END;
$$;

CREATE INDEX "Listing_slug_backfill_idx" ON "Listing"("slug");

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
    base_slug := listing_slug_normalize(listing_record."title");

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

DROP INDEX "Listing_slug_backfill_idx";

CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");
