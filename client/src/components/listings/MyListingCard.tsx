import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BedDouble, Bath, Building2, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';

interface MyListingCardProps {
  listing: {
    id: number;
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
  onTogglePublish: (id: number, published: boolean) => void;
  onDelete: (id: number) => void;
  isToggling?: boolean;
}

export function MyListingCard({ listing, lang, onTogglePublish, onDelete, isToggling }: MyListingCardProps) {
  const { t } = useTranslation();
  const coverPhoto = listing.photos?.[0]?.url;

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <Link to={`/${lang}/listings/${listing.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {coverPhoto ? (
            <img
              src={coverPhoto}
              alt={listing.title}
              className={`w-full h-full object-cover transition-transform duration-300 hover:scale-105 ${!listing.published ? 'opacity-60' : ''}`}
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${!listing.published ? 'opacity-60' : ''}`}>
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
            </div>
          )}
          <Badge className="absolute top-3 right-3 bg-background/90 text-foreground font-semibold">
            {new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(listing.monthly_rent))}{t('listings.perMonth')}
          </Badge>
          <Badge
            className={`absolute top-3 left-3 ${listing.published ? 'bg-green-600 hover:bg-green-600' : 'bg-amber-600 hover:bg-amber-600'} text-white`}
          >
            {listing.published ? t('myListings.published') : t('myListings.unpublished')}
          </Badge>
        </div>
      </Link>
      <CardContent className="p-4 flex flex-col flex-1">
        <Link to={`/${lang}/listings/${listing.id}`} className="block mb-1">
          <h3 className="font-semibold text-lg truncate hover:text-primary transition-colors">
            {listing.title}
          </h3>
        </Link>
        <p className="text-sm text-muted-foreground mb-3">
          {listing.address_1}, {listing.city}
        </p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <BedDouble className="h-4 w-4" />
            {listing.bedrooms}
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-4 w-4" />
            {listing.bathrooms}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-auto pt-3 border-t">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/${lang}/listings/${listing.id}/edit`} aria-label={`${t('common.edit')} - ${listing.title}`}>
              <Pencil className="h-4 w-4 mr-1" />
              {t('common.edit')}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTogglePublish(listing.id, listing.published)}
            disabled={isToggling}
            aria-label={listing.published ? t('myListings.unpublish') : t('myListings.publish')}
          >
            {listing.published ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                {t('myListings.unpublish')}
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                {t('myListings.publish')}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(listing.id)}
            disabled={isToggling}
            className="text-destructive hover:text-destructive ml-auto"
            aria-label={`${t('common.delete')} - ${listing.title}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
