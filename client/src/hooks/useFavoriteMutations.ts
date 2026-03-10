import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface FavoritePayload {
  listingId: number;
  note?: string | null;
}

export function useFavoriteMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const invalidateFavoriteData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all }),
    ]);
  };

  const addFavoriteMutation = useMutation({
    mutationFn: async ({ listingId, note }: FavoritePayload) => {
      const res = await api.post('/api/v1/favorites', {
        listing_id: listingId,
        note: note ?? null,
      });
      return res.data;
    },
    onSuccess: async () => {
      await invalidateFavoriteData();
      toast.success(t('favorites.addedSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateFavoriteNoteMutation = useMutation({
    mutationFn: async ({ listingId, note }: FavoritePayload) => {
      const res = await api.patch(`/api/v1/favorites/${listingId}`, {
        note: note ?? null,
      });
      return res.data;
    },
    onSuccess: async () => {
      await invalidateFavoriteData();
      toast.success(t('favorites.noteSavedSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async ({ listingId }: FavoritePayload) => {
      const res = await api.delete(`/api/v1/favorites/${listingId}`);
      return res.data;
    },
    onSuccess: async () => {
      await invalidateFavoriteData();
      toast.success(t('favorites.removedSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    addFavorite: addFavoriteMutation.mutateAsync,
    updateFavoriteNote: updateFavoriteNoteMutation.mutateAsync,
    removeFavorite: removeFavoriteMutation.mutateAsync,
    isAddingFavorite: addFavoriteMutation.isPending,
    isUpdatingFavoriteNote: updateFavoriteNoteMutation.isPending,
    isRemovingFavorite: removeFavoriteMutation.isPending,
  };
}
