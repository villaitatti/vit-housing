import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BedDouble, Bath, Building2, Heart, StickyNote, Ruler, ChevronLeft, ChevronRight } from 'lucide-react';
import { getListingDetailPath } from '@/lib/listingPaths';

interface ListingCardListing {
  id: number;
  slug: string;
  title: string;
  address_1: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  floor_space?: number | null;
  is_favorite?: boolean;
  photos?: { url: string }[];
}

type FavoriteButtonProps<TListing extends ListingCardListing> =
  | {
      showFavoriteButton: true;
      onFavoriteClick: (listing: TListing) => void;
    }
  | {
      showFavoriteButton?: false;
      onFavoriteClick?: never;
    };

type FavoriteNoteSectionProps<TListing extends ListingCardListing> =
  | {
      showFavoriteNoteSection: true;
      onEditNote: (listing: TListing) => void;
      favoriteNote?: string | null;
      noteActionLabel?: string;
    }
  | {
      showFavoriteNoteSection?: false;
      onEditNote?: never;
      favoriteNote?: never;
      noteActionLabel?: never;
    };

type ListingCardProps<TListing extends ListingCardListing> = {
  listing: TListing;
  lang: string;
  openInNewTab?: boolean;
} & FavoriteButtonProps<TListing> & FavoriteNoteSectionProps<TListing>;

export function ListingCard<TListing extends ListingCardListing>({
  listing,
  lang,
  openInNewTab = false,
  showFavoriteButton = false,
  onFavoriteClick,
  showFavoriteNoteSection = false,
  favoriteNote,
  onEditNote,
  noteActionLabel,
}: ListingCardProps<TListing>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = listing.photos ?? [];
  const totalPhotos = photos.length;
  const currentPhoto = photos[photoIndex]?.url;
  const detailPath = getListingDetailPath(lang, listing.slug);

  useEffect(() => {
    setPhotoIndex(0);
  }, [listing.id]);

  const openListing = () => {
    if (openInNewTab) {
      window.open(detailPath, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate(detailPath);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openListing();
    }

    if (totalPhotos > 1 && event.key === 'ArrowLeft') {
      event.preventDefault();
      setPhotoIndex((i) => (i - 1 + totalPhotos) % totalPhotos);
    }

    if (totalPhotos > 1 && event.key === 'ArrowRight') {
      event.preventDefault();
      setPhotoIndex((i) => (i + 1) % totalPhotos);
    }
  };

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onFavoriteClick?.(listing);
  };

  const handleFavoriteKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onFavoriteClick?.(listing);
    }
  };

  const handleEditNoteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onEditNote?.(listing);
  };

  const handleEditNoteKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onEditNote?.(listing);
    }
  };

  return (
    <Card
      className="group h-full cursor-pointer overflow-hidden transition-shadow duration-200 hover:shadow-lg"
      role="link"
      tabIndex={0}
      onClick={openListing}
      onKeyDown={handleCardKeyDown}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {currentPhoto ? (
          <img
            src={currentPhoto}
            alt={listing.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building2 className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}

        {totalPhotos > 1 ? (
          <>
            <button
              type="button"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-background/80 p-1 opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPhotoIndex((i) => (i - 1 + totalPhotos) % totalPhotos); }}
              aria-label={t('listings.previousPhoto')}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-background/80 p-1 opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPhotoIndex((i) => (i + 1) % totalPhotos); }}
              aria-label={t('listings.nextPhoto')}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span
              className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white"
              role="status"
              aria-label={t('listings.photoCounter', { current: photoIndex + 1, total: totalPhotos })}
            >
              {photoIndex + 1}/{totalPhotos}
            </span>
          </>
        ) : null}

        {showFavoriteButton ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute top-3 right-3 h-10 w-10 rounded-full bg-background/90 backdrop-blur"
            onClick={handleFavoriteClick}
            onKeyDown={handleFavoriteKeyDown}
            aria-label={listing.is_favorite ? t('favorites.removeAction') : t('favorites.addAction')}
          >
            <Heart
              className={listing.is_favorite ? 'h-5 w-5 fill-[crimson] text-[crimson]' : 'h-5 w-5'}
            />
          </Button>
        ) : null}
      </div>

      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="mb-1 text-lg font-semibold leading-tight transition-colors group-hover:text-primary">
              {listing.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {listing.address_1}, {listing.city}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            €{Number(listing.monthly_rent).toLocaleString()}{t('listings.perMonth')}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <BedDouble className="h-4 w-4" />
            {listing.bedrooms}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            {listing.bathrooms}
          </span>
          {listing.floor_space ? (
            <span className="flex items-center gap-1">
              <Ruler className="h-4 w-4" />
              {t('listings.floorSpaceValue', { value: listing.floor_space })}
            </span>
          ) : null}
        </div>

        {showFavoriteNoteSection ? (
          <div className="mt-4 rounded-xl bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" />
              {t('favorites.noteLabel')}
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-foreground/90">
              {favoriteNote || t('favorites.noNote')}
            </p>
            {onEditNote ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 -ml-3"
                onClick={handleEditNoteClick}
                onKeyDown={handleEditNoteKeyDown}
              >
                {noteActionLabel || t('favorites.editNote')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
