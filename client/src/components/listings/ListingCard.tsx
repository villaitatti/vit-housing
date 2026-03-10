import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BedDouble, Bath, Building2 } from 'lucide-react';
import { getListingDetailPath } from '@/lib/listingPaths';

interface ListingCardProps {
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
    photos?: { url: string }[];
  };
  lang: string;
}

export function ListingCard({ listing, lang }: ListingCardProps) {
  const { t } = useTranslation();
  const coverPhoto = listing.photos?.[0]?.url;

  return (
    <Link to={getListingDetailPath(lang, listing.slug)}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200 group cursor-pointer h-full">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={listing.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          <Badge className="absolute top-3 right-3 bg-background/90 text-foreground font-semibold">
            €{Number(listing.monthly_rent).toLocaleString()}{t('listings.perMonth')}
          </Badge>
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg truncate mb-1 group-hover:text-primary transition-colors">
            {listing.title}
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {listing.address_1}, {listing.city}
          </p>
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
        </CardContent>
      </Card>
    </Link>
  );
}
