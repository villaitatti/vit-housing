import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { MyListingCard } from '@/components/listings/MyListingCard';
import type { PaginatedData } from '@vithousing/shared';

interface MyListing {
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
  created_at: string;
  photos?: { url: string }[];
}

export function MyListingsPage() {
  const { t } = useTranslation();
  const { lang: rawLang } = useParams();
  const lang = rawLang || 'en';
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);

  const filters = { owner: 'me' as const, limit: 12, page };

  const { data, isLoading, isError, error } = useQuery<PaginatedData<MyListing>>({
    queryKey: queryKeys.listings.mine(filters),
    queryFn: async () => {
      const res = await api.get('/api/v1/listings', { params: filters });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/listings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success(t('myListings.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, published }: { id: number; published: boolean }) => {
      await api.patch(`/api/v1/listings/${id}`, { published });
    },
    onMutate: ({ id }) => {
      setTogglingIds((prev) => new Set(prev).add(id));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success(
        variables.published ? t('myListings.publishSuccess') : t('myListings.unpublishSuccess'),
      );
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSettled: (_data, _error, variables) => {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-destructive">{(error as Error)?.message || t('common.error')}</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <Button asChild>
          <Link to={`/${lang}/listings/new`}>
            <Plus className="h-4 w-4 mr-2" />
            {t('myListings.createFirst')}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-lg text-muted-foreground mb-2">{t('myListings.noListings')}</p>
          <p className="text-sm text-muted-foreground mb-6">{t('myListings.noListingsDescription')}</p>
          <Button asChild>
            <Link to={`/${lang}/listings/new`}>
              <Plus className="h-4 w-4 mr-2" />
              {t('myListings.createFirst')}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((listing) => (
              <MyListingCard
                key={listing.id}
                listing={listing}
                lang={lang}
                onTogglePublish={(id, currentPublished) =>
                  togglePublishMutation.mutate({ id, published: !currentPublished })
                }
                onDelete={(id) => setDeleteId(id)}
                isToggling={togglingIds.has(listing.id)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('common.back')}
              </Button>
              <span className="flex items-center text-sm text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label={t('pagination.nextPage', 'Next page')}
              >
                &rarr;
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('myListings.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('myListings.deleteConfirmMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
