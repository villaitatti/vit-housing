import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bath, BedDouble, Building2, ExternalLink, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getListingDetailPath, getListingEditPath } from '@/lib/listingPaths';

interface AdminManagedListingCardProps {
  listing: {
    id: number;
    slug: string;
    title: string;
    address_1: string;
    city: string;
    province: string;
    monthly_rent: number | string;
    bedrooms: number;
    bathrooms: number;
    published: boolean;
    photos?: { url: string }[];
  };
  lang: string;
}

export function AdminManagedListingCard({ listing, lang }: AdminManagedListingCardProps) {
  const { t } = useTranslation();
  const coverPhoto = listing.photos?.[0]?.url;

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-2xl border-border/70 bg-card/95 shadow-sm">
      <Link to={getListingDetailPath(lang, listing.slug)} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={listing.title}
              className={`h-full w-full object-cover transition-transform duration-300 hover:scale-105 ${listing.published ? '' : 'opacity-70'}`}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center ${listing.published ? '' : 'opacity-70'}`}>
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}

          <Badge className="absolute top-3 right-3 bg-background/90 font-semibold text-foreground">
            {new Intl.NumberFormat(lang, {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            }).format(Number(listing.monthly_rent))}
            {t('listings.perMonth')}
          </Badge>
          <Badge
            className={`absolute top-3 left-3 text-white ${listing.published ? 'bg-green-600 hover:bg-green-600' : 'bg-amber-600 hover:bg-amber-600'}`}
          >
            {listing.published ? t('myListings.published') : t('myListings.unpublished')}
          </Badge>
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <Link to={getListingDetailPath(lang, listing.slug)} className="block">
            <h3 className="truncate text-lg font-semibold transition-colors hover:text-primary">
              {listing.title}
            </h3>
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {listing.address_1}, {listing.city}
          </p>
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
        </div>

        <div className="mt-auto flex items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" asChild>
            <Link to={getListingDetailPath(lang, listing.slug)}>
              <ExternalLink className="mr-1 h-4 w-4" />
              {t('listings.viewListing')}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to={getListingEditPath(lang, listing.slug)}>
              <Pencil className="mr-1 h-4 w-4" />
              {t('common.edit')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
