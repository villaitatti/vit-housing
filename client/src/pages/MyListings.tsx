import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Pencil, Trash2, Plus } from 'lucide-react';
import type { PaginatedData } from '@vithousing/shared';

interface MyListing {
  id: number;
  title: string;
  city: string;
  monthly_rent: number | string;
  created_at: string;
}

export function MyListingsPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const filters = { owner: 'me' as const, limit: 50, page };

  const { data, isLoading } = useQuery<PaginatedData<MyListing>>({
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
      toast.success(t('common.delete'));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-3">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{t('myListings.title')}</h1>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('listingForm.postingTitle')}</TableHead>
                <TableHead>{t('listingForm.city')}</TableHead>
                <TableHead>{t('listingForm.monthlyRent')}</TableHead>
                <TableHead>{t('admin.userColumns.createdAt')}</TableHead>
                <TableHead>{t('admin.userColumns.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((listing) => (
                <TableRow key={listing.id}>
                  <TableCell>
                    <Link
                      to={`/${lang}/listings/${listing.id}`}
                      className="text-primary hover:underline"
                    >
                      {listing.title}
                    </Link>
                  </TableCell>
                  <TableCell>{listing.city}</TableCell>
                  <TableCell>€{Number(listing.monthly_rent).toLocaleString()}</TableCell>
                  <TableCell>{new Date(listing.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/${lang}/listings/${listing.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(listing.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

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
              >
                →
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('admin.deleteConfirmMessage')}</DialogDescription>
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
