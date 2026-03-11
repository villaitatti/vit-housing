import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BedDouble, Bath, Ruler, Building2, MapPin, Euro, Phone, Mail, User,
  Warehouse, TreePine, Sun, Wind, WashingMachine, Flame, Tv, Wifi, Car, PawPrint, Heart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { getListingDetailPath, isLegacyListingIdParam } from '@/lib/listingPaths';
import { useAuth } from '@/hooks/useAuth';
import { useFavoriteMutations } from '@/hooks/useFavoriteMutations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { FavoriteListingDialog } from '@/components/listings/FavoriteListingDialog';
import { canUseFavoriteListings } from '@vithousing/shared';

// Swiper
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface ListingPhoto {
  id: number;
  url: string;
}

interface ListingAvailableDate {
  id: number;
  available_from: string;
  available_to: string | null;
}

interface ListingOwner {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  mobile_number: string | null;
}

interface ListingDetail {
  id: number;
  slug: string;
  title: string;
  description: string;
  address_1: string;
  address_2: string | null;
  postal_code: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  deposit: number | string | null;
  condominium_expenses: number | string | null;
  utility_electricity: boolean;
  utility_gas: boolean;
  utility_water: boolean;
  utility_telephone: boolean;
  utility_internet: boolean;
  accommodation_type: string;
  floor: string;
  bathrooms: number;
  bedrooms: number;
  floor_space: number | null;
  latitude: number | null;
  longitude: number | null;
  feature_storage_room: boolean;
  feature_basement: boolean;
  feature_garden: boolean;
  feature_balcony: boolean;
  feature_air_con: boolean;
  feature_washing_machine: boolean;
  feature_dryer: boolean;
  feature_fireplace: boolean;
  feature_dishwasher: boolean;
  feature_elevator: boolean;
  feature_tv: boolean;
  feature_telephone: boolean;
  feature_wifi: boolean;
  feature_wired_internet: boolean;
  feature_parking: boolean;
  feature_pets_allowed: boolean;
  published: boolean;
  owner_id: number;
  is_favorite: boolean;
  photos: ListingPhoto[];
  available_dates: ListingAvailableDate[];
  owner: ListingOwner | null;
}

const featureIcons: Record<string, LucideIcon> = {
  feature_storage_room: Warehouse,
  feature_basement: Warehouse,
  feature_garden: TreePine,
  feature_balcony: Sun,
  feature_air_con: Wind,
  feature_washing_machine: WashingMachine,
  feature_dryer: WashingMachine,
  feature_fireplace: Flame,
  feature_dishwasher: WashingMachine,
  feature_elevator: Building2,
  feature_tv: Tv,
  feature_telephone: Phone,
  feature_wifi: Wifi,
  feature_wired_internet: Wifi,
  feature_parking: Car,
  feature_pets_allowed: PawPrint,
};

export function ListingDetailPage() {
  const { t } = useTranslation();
  const { lang, slug } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canFavoriteListings = canUseFavoriteListings(user?.roles ?? []);
  const { addFavorite, removeFavorite, isAddingFavorite, isRemovingFavorite } = useFavoriteMutations();
  const listingParam = slug?.trim() || '';
  const currentLang = lang || 'en';
  const isLegacyId = isLegacyListingIdParam(listingParam);
  const [favoriteDialogMode, setFavoriteDialogMode] = useState<'add' | 'remove' | null>(null);

  const { data, isLoading } = useQuery<ListingDetail>({
    queryKey: isLegacyId
      ? queryKeys.listings.detailById(Number(listingParam))
      : queryKeys.listings.detailBySlug(listingParam),
    queryFn: async () => {
      const endpoint = isLegacyId
        ? `/api/v1/listings/${listingParam}`
        : `/api/v1/listings/by-slug/${listingParam}`;
      const res = await api.get(endpoint);
      return res.data.listing;
    },
    enabled: !!listingParam,
  });

  useEffect(() => {
    if (data && isLegacyId) {
      queryClient.setQueryData(queryKeys.listings.detailBySlug(data.slug), data);
      navigate(getListingDetailPath(currentLang, data.slug), { replace: true });
    }
  }, [currentLang, data, isLegacyId, navigate, queryClient]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-96 w-full rounded-lg" />
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t('errors.notFound')}</p>
      </div>
    );
  }

  const listing = data;
  const canToggleFavorite = canFavoriteListings && listing.published;
  const features = Object.entries(listing)
    .filter(([key, value]) => key.startsWith('feature_') && value === true)
    .map(([key]) => key);

  const utilities = [
    listing.utility_electricity && t('listingDetail.electricity'),
    listing.utility_gas && t('listingDetail.gas'),
    listing.utility_water && t('listingDetail.water'),
    listing.utility_telephone && t('listingDetail.telephone'),
    listing.utility_internet && t('listingDetail.internet'),
  ].filter((util): util is string => Boolean(util));

  const handleFavoriteConfirm = async (note: string) => {
    if (!favoriteDialogMode) {
      return;
    }

    if (favoriteDialogMode === 'add') {
      await addFavorite({ listingId: listing.id, note });
    }

    if (favoriteDialogMode === 'remove') {
      await removeFavorite({ listingId: listing.id });
    }

    setFavoriteDialogMode(null);
  };

  return (
    <motion.div
      className="container mx-auto px-4 py-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Unpublished banner */}
      {!listing.published && user && listing.owner_id === user.id && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">{t('myListings.unpublishedPreviewHint')}</p>
        </div>
      )}

      {/* Photo Gallery */}
      {listing.photos?.length > 0 && (
        <div className="mb-8 rounded-lg overflow-hidden">
          <Swiper
            modules={[Navigation, Pagination]}
            navigation
            pagination={{ clickable: true }}
            className="aspect-[16/9] max-h-[500px]"
          >
            {listing.photos.map((photo) => (
              <SwiperSlide key={photo.id}>
                <img
                  src={photo.url}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-2xl font-semibold">{listing.title}</div>
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {listing.address_1}
                {listing.address_2 && `, ${listing.address_2}`}, {listing.postal_code} {listing.city},{' '}
                {listing.province}
              </p>
            </div>
            {canToggleFavorite ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full"
                onClick={() => setFavoriteDialogMode(listing.is_favorite ? 'remove' : 'add')}
                aria-label={listing.is_favorite ? t('favorites.removeAction') : t('favorites.addAction')}
              >
                <Heart
                  className={listing.is_favorite ? 'h-5 w-5 fill-[crimson] text-[crimson]' : 'h-5 w-5'}
                />
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Euro className="h-4 w-4 mr-1" />
              {Number(listing.monthly_rent).toLocaleString()}{t('listings.perMonth')}
            </Badge>
            <Badge variant="outline" className="text-base px-3 py-1.5">
              <BedDouble className="h-4 w-4 mr-1" />
              {listing.bedrooms} {t('listings.bedrooms')}
            </Badge>
            <Badge variant="outline" className="text-base px-3 py-1.5">
              <Bath className="h-4 w-4 mr-1" />
              {listing.bathrooms} {t('listings.bathrooms')}
            </Badge>
            {listing.floor_space && (
              <Badge variant="outline" className="text-base px-3 py-1.5">
                <Ruler className="h-4 w-4 mr-1" />
                {listing.floor_space} {t('listings.sqm')}
              </Badge>
            )}
          </div>

          <Separator />

          {/* Description */}
          <section>
            <h2 className="text-xl font-semibold mb-3">{t('listingDetail.description')}</h2>
            <p className="text-muted-foreground whitespace-pre-line">{listing.description}</p>
          </section>

          <Separator />

          {/* Details */}
          <section>
            <h2 className="text-xl font-semibold mb-3">{t('listingDetail.details')}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t('listingDetail.accommodationType')}</span>
                <p className="font-medium">{listing.accommodation_type}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('listingDetail.floor')}</span>
                <p className="font-medium">{listing.floor}</p>
              </div>
              {listing.deposit && (
                <div>
                  <span className="text-muted-foreground">{t('listingDetail.deposit')}</span>
                  <p className="font-medium">€{Number(listing.deposit).toLocaleString()}</p>
                </div>
              )}
              {listing.condominium_expenses && (
                <div>
                  <span className="text-muted-foreground">{t('listingDetail.condominiumExpenses')}</span>
                  <p className="font-medium">€{Number(listing.condominium_expenses).toLocaleString()}</p>
                </div>
              )}
            </div>

            {utilities.length > 0 && (
              <div className="mt-4">
                <span className="text-sm text-muted-foreground">{t('listingDetail.utilitiesIncluded')}</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {utilities.map((util) => (
                    <Badge key={util} variant="secondary">
                      {util}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Features */}
          {features.length > 0 && (
            <>
              <Separator />
              <section>
                <h2 className="text-xl font-semibold mb-3">{t('listingDetail.features')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {features.map((feature) => {
                    const Icon = featureIcons[feature] || Building2;
                    const labelKey = feature
                      .replace('feature_', '')
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase());
                    const translationKey = `listingForm.features.${feature.replace('feature_', '').replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
                    return (
                      <div key={feature} className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span>{t(translationKey, labelKey)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* Available Dates */}
          {listing.available_dates?.length > 0 && (
            <>
              <Separator />
              <section>
                <h2 className="text-xl font-semibold mb-3">{t('listingDetail.availableDates')}</h2>
                <div className="space-y-2">
                  {listing.available_dates.map((date) => (
                    <div key={date.id} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{t('listingDetail.from')}:</span>
                      <span>{new Date(date.available_from).toLocaleDateString()}</span>
                      {date.available_to ? (
                        <>
                          <span className="text-muted-foreground">— {t('listingDetail.to')}:</span>
                          <span>{new Date(date.available_to).toLocaleDateString()}</span>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {t('listingDetail.ongoing')}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Owner Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('listingDetail.ownerInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>
                  {listing.owner?.first_name} {listing.owner?.last_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${listing.owner?.email}`} className="text-primary hover:underline">
                  {listing.owner?.email}
                </a>
              </div>
              {listing.owner?.phone_number && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{listing.owner.phone_number}</span>
                </div>
              )}
              {listing.owner?.mobile_number && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{listing.owner.mobile_number}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Map */}
          {listing.latitude && listing.longitude && (
            <Card>
              <CardContent className="p-0">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                  {/* Google Maps will be rendered here */}
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}&q=${listing.latitude},${listing.longitude}&zoom=15`}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {favoriteDialogMode ? (
        <FavoriteListingDialog
          key={`${favoriteDialogMode}-${listing.id}`}
          open
          mode={favoriteDialogMode}
          listingTitle={listing.title}
          isPending={favoriteDialogMode === 'add' ? isAddingFavorite : isRemovingFavorite}
          onClose={() => setFavoriteDialogMode(null)}
          onConfirm={handleFavoriteConfirm}
        />
      ) : null}
    </motion.div>
  );
}
