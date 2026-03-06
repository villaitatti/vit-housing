import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import type { CreateListingInput } from '@vithousing/shared';
import api from '@/lib/api';
import { toast } from 'sonner';
import { ListingForm, type PhotoFile } from '@/components/listings/ListingForm';

export function NewListingPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();

  const createMutation = useMutation({
    mutationFn: async ({ data, photos }: { data: CreateListingInput; photos: PhotoFile[] }) => {
      if (photos.length < 2) {
        throw new Error(t('listingForm.photos.minRequired'));
      }

      const res = await api.post('/api/v1/listings', data);
      const listingId = res.data.listing.id;

      // Order photos: main first, then rest
      const mainPhoto = photos.find((p) => p.isMain);
      const otherPhotos = photos.filter((p) => !p.isMain);
      const orderedPhotos = mainPhoto ? [mainPhoto, ...otherPhotos] : photos;

      try {
        for (const photo of orderedPhotos) {
          const formData = new FormData();
          formData.append('photo', photo.file);
          await api.post(`/api/v1/listings/${listingId}/photos`, formData, {
            headers: { 'Content-Type': undefined as unknown as string },
          });
        }
      } catch (uploadErr) {
        // Roll back the listing if photo uploads fail
        await api.delete(`/api/v1/listings/${listingId}`).catch(() => {});
        throw uploadErr;
      }

      return listingId;
    },
    onSuccess: (listingId) => {
      toast.success(t('common.save'));
      navigate(`/${lang}/listings/${listingId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (data: CreateListingInput, newPhotos: PhotoFile[]) => {
    if (newPhotos.length < 2) {
      toast.error(t('listingForm.photos.minRequired'));
      return;
    }
    createMutation.mutate({ data, photos: newPhotos });
  };

  return (
    <motion.div
      className="container mx-auto px-4 py-8 max-w-3xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="text-3xl font-bold mb-8">{t('listingForm.createTitle')}</h1>

      <ListingForm
        mode="create"
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
      />
    </motion.div>
  );
}
