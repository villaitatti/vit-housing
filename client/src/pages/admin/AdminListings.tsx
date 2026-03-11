import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { getListingDetailPath, getListingEditPath } from '@/lib/listingPaths';
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
import { Pencil, Trash2 } from 'lucide-react';
import type { PaginatedData } from '@vithousing/shared';

interface AdminListing {
  id: number;
  slug: string;
  title: string;
  city: string;
  monthly_rent: number | string;
  created_at: string;
}

export function AdminListingsPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PaginatedData<AdminListing>>({
    queryKey: queryKeys.listings.all,
    queryFn: async () => {
      const res = await api.get('/api/v1/listings', { params: { limit: 50 } });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/listings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      toast.success(t('common.delete'));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>{t('listingForm.postingTitle')}</TableHead>
            <TableHead>{t('listingForm.city')}</TableHead>
            <TableHead>{t('listingForm.monthlyRent')}</TableHead>
            <TableHead>{t('admin.userColumns.createdAt')}</TableHead>
            <TableHead>{t('admin.userColumns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items?.map((listing) => (
            <TableRow key={listing.id}>
              <TableCell>{listing.id}</TableCell>
              <TableCell>
                <Link
                  to={getListingDetailPath(lang || 'en', listing.slug)}
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
                    <Link to={getListingEditPath(lang || 'en', listing.slug)}>
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
