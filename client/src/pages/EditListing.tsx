import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import type { CreateListingInput } from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { getListingDetailPath, getListingEditPath, isLegacyListingIdParam } from '@/lib/listingPaths';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingForm, type PhotoFile, type ExistingPhoto } from '@/components/listings/ListingForm';

interface ListingDetail {
  id: number;
  slug: string;
  owner_id: number;
  title: string;
  description: string;
  address_1: string;
  address_2: string | null;
  postal_code: string;
  city: string;
  province: string;
  monthly_rent: number;
  deposit: number | null;
  condominium_expenses: number | null;
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
  photos: { id: number; url: string; sort_order: number }[];
  available_dates: { id: number; available_from: string; available_to: string | null }[];
}

export function EditListingPage() {
  const { t } = useTranslation();
  const { lang, slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listingParam = slug?.trim() || '';
  const currentLang = lang || 'en';
  const isLegacyId = isLegacyListingIdParam(listingParam);

  const { data: listing, isLoading, error } = useQuery<ListingDetail>({
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
    if (listing && isLegacyId) {
      navigate(getListingEditPath(currentLang, listing.slug), { replace: true });
    }
  }, [currentLang, isLegacyId, listing, navigate]);

  // Ownership check for landlords
  const isForbidden =
    listing &&
    !user?.roles.some(r => ['HOUSE_ADMIN', 'HOUSE_IT_ADMIN'].includes(r)) &&
    listing.owner_id !== user?.id;

  const updateMutation = useMutation({
    mutationFn: async ({
      formData,
      newPhotos,
      deletedPhotoIds,
    }: {
      formData: CreateListingInput;
      newPhotos: PhotoFile[];
      deletedPhotoIds: number[];
    }) => {
      if (!listing) {
        throw new Error(t('errors.notFound'));
      }

      const listingId = listing.id;

      // 1. Update listing data
      await api.patch(`/api/v1/listings/${listingId}`, formData);

      // 2. Delete removed photos
      for (const photoId of deletedPhotoIds) {
        await api.delete(`/api/v1/listings/${listingId}/photos/${photoId}`);
      }

      // 3. Upload new photos
      for (const photo of newPhotos) {
        const fd = new FormData();
        fd.append('photo', photo.file);
        await api.post(`/api/v1/listings/${listingId}/photos`, fd);
      }

      return { id: listingId, slug: listing.slug };
    },
    onSuccess: ({ id, slug: listingSlug }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.detailById(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.detailBySlug(listingSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      toast.success(t('common.save'));
      navigate(getListingDetailPath(currentLang, listingSlug));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto px-6 lg:px-11 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-destructive">{t('errors.notFound')}</p>
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-destructive">{t('errors.forbidden')}</p>
      </div>
    );
  }

  const initialData: Partial<CreateListingInput> = {
    title: listing.title,
    description: listing.description,
    address_1: listing.address_1,
    address_2: listing.address_2,
    postal_code: listing.postal_code,
    city: listing.city,
    province: listing.province,
    monthly_rent: Number(listing.monthly_rent),
    deposit: listing.deposit ? Number(listing.deposit) : undefined,
    condominium_expenses: listing.condominium_expenses ? Number(listing.condominium_expenses) : undefined,
    utility_electricity: listing.utility_electricity,
    utility_gas: listing.utility_gas,
    utility_water: listing.utility_water,
    utility_telephone: listing.utility_telephone,
    utility_internet: listing.utility_internet,
    accommodation_type: listing.accommodation_type,
    floor: listing.floor,
    bathrooms: listing.bathrooms,
    bedrooms: listing.bedrooms,
    floor_space: listing.floor_space ?? undefined,
    feature_storage_room: listing.feature_storage_room,
    feature_basement: listing.feature_basement,
    feature_garden: listing.feature_garden,
    feature_balcony: listing.feature_balcony,
    feature_air_con: listing.feature_air_con,
    feature_washing_machine: listing.feature_washing_machine,
    feature_dryer: listing.feature_dryer,
    feature_fireplace: listing.feature_fireplace,
    feature_dishwasher: listing.feature_dishwasher,
    feature_elevator: listing.feature_elevator,
    feature_tv: listing.feature_tv,
    feature_telephone: listing.feature_telephone,
    feature_wifi: listing.feature_wifi,
    feature_wired_internet: listing.feature_wired_internet,
    feature_parking: listing.feature_parking,
    feature_pets_allowed: listing.feature_pets_allowed,
    available_dates: listing.available_dates.length > 0
      ? listing.available_dates.map((d) => ({
          available_from: d.available_from.split('T')[0],
          available_to: d.available_to ? d.available_to.split('T')[0] : undefined,
        }))
      : [{ available_from: '' }],
  };

  const existingPhotos: ExistingPhoto[] = listing.photos.map((p) => ({
    id: p.id,
    url: p.url,
    sort_order: p.sort_order,
  }));

  const handleSubmit = (formData: CreateListingInput, newPhotos: PhotoFile[], deletedPhotoIds: number[]) => {
    updateMutation.mutate({ formData, newPhotos, deletedPhotoIds });
  };

  return (
    <motion.div
      className="mx-auto px-6 lg:px-11 py-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <ListingForm
        key={listing.id}
        mode="edit"
        initialData={initialData}
        existingPhotos={existingPhotos}
        onSubmit={handleSubmit}
        isSubmitting={updateMutation.isPending}
      />
    </motion.div>
  );
}
