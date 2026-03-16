import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Pencil, SearchX, Trash2, X } from 'lucide-react';
import type { PaginatedDataWithStats } from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { getListingDetailPath, getListingEditPath } from '@/lib/listingPaths';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface AdminListing {
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
  owner: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface AdminListingsStats {
  totalListings: number;
}

type AdminListingsResponse = PaginatedDataWithStats<AdminListing, AdminListingsStats>;

export function AdminListingsPage() {
  const { t, i18n } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang || 'en';
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [address, setAddress] = useState('');
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const deferredTitle = useDeferredValue(title);
  const deferredOwnerSearch = useDeferredValue(ownerSearch);
  const deferredAddress = useDeferredValue(address);
  const deferredMinRent = useDeferredValue(minRent);
  const deferredMaxRent = useDeferredValue(maxRent);

  const filters = {
    title: deferredTitle.trim(),
    ownerSearch: deferredOwnerSearch.trim(),
    address: deferredAddress.trim(),
    minRent: deferredMinRent.trim(),
    maxRent: deferredMaxRent.trim(),
    page,
    limit,
  };

  const { data, isLoading, isFetching } = useQuery<AdminListingsResponse>({
    queryKey: queryKeys.listings.admin(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (filters.title) params.title = filters.title;
      if (filters.ownerSearch) params.ownerSearch = filters.ownerSearch;
      if (filters.address) params.address = filters.address;
      if (filters.minRent) params.minRent = Number(filters.minRent);
      if (filters.maxRent) params.maxRent = Number(filters.maxRent);

      const res = await api.get('/api/v1/admin/listings', { params });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/listings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(t('myListings.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const clearFilters = () => {
    setTitle('');
    setOwnerSearch('');
    setAddress('');
    setMinRent('');
    setMaxRent('');
    setPage(1);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setPage(1);
  };

  const handleOwnerSearchChange = (value: string) => {
    setOwnerSearch(value);
    setPage(1);
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setPage(1);
  };

  const handleMinRentChange = (value: string) => {
    setMinRent(value);
    setPage(1);
  };

  const handleMaxRentChange = (value: string) => {
    setMaxRent(value);
    setPage(1);
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6 pb-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const totalPages = data?.totalPages ?? 1;
  const activeFilterCount = [title, ownerSearch, address, minRent, maxRent].filter(Boolean).length;

  return (
    <div className="space-y-6 pb-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label={t('admin.totalListings')}
          value={data?.stats.totalListings ?? 0}
          description={t('admin.totalListingsDescription')}
        />
      </div>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle>{t('admin.filtersTitle')}</CardTitle>
          <CardDescription>{t('admin.listingsFiltersDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder={t('admin.listingTitlePlaceholder')}
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
            />
            <Input
              placeholder={t('admin.landlordSearchPlaceholder')}
              value={ownerSearch}
              onChange={(event) => handleOwnerSearchChange(event.target.value)}
            />
            <Input
              placeholder={t('admin.listingAddressPlaceholder')}
              value={address}
              onChange={(event) => handleAddressChange(event.target.value)}
            />
            <Input
              type="number"
              min="0"
              placeholder={t('listings.minRent')}
              value={minRent}
              onChange={(event) => handleMinRentChange(event.target.value)}
            />
            <Input
              type="number"
              min="0"
              placeholder={t('listings.maxRent')}
              value={maxRent}
              onChange={(event) => handleMaxRentChange(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t('admin.resultsCount', { count: data?.total ?? 0 })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {isFetching ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </span>
              ) : null}
              {activeFilterCount > 0 ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  {t('admin.clearAllFilters')}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle>{t('admin.listings')}</CardTitle>
          <CardDescription>{t('admin.listingsTableDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t('listingForm.postingTitle')}</TableHead>
                  <TableHead>{t('admin.landlord')}</TableHead>
                  <TableHead>{t('listingForm.address1')}</TableHead>
                  <TableHead>{t('listingForm.monthlyRent')}</TableHead>
                  <TableHead>{t('admin.listingStatus')}</TableHead>
                  <TableHead>{t('admin.userColumns.createdAt')}</TableHead>
                  <TableHead>{t('admin.userColumns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell className="font-medium">{listing.id}</TableCell>
                    <TableCell>
                      <Link
                        to={getListingDetailPath(currentLang, listing.slug)}
                        className="font-medium text-primary hover:underline"
                      >
                        {listing.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/${currentLang}/admin/users/${listing.owner.id}`}
                        className="block font-medium text-primary hover:underline"
                      >
                        {listing.owner.first_name} {listing.owner.last_name}
                      </Link>
                      <div className="text-sm text-muted-foreground">{listing.owner.email}</div>
                    </TableCell>
                    <TableCell>
                      {listing.address_1}
                      <div className="text-sm text-muted-foreground">
                        {listing.city}, {listing.province}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat(i18n.language, {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 0,
                      }).format(Number(listing.monthly_rent))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={listing.published ? 'secondary' : 'outline'}>
                        {listing.published ? t('myListings.published') : t('myListings.unpublished')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(listing.created_at).toLocaleString(i18n.language, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={getListingEditPath(currentLang, listing.slug)}>
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
          </div>

          {!isLoading && data?.items?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">{t('admin.noAdminListings')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('admin.noAdminListingsDescription')}
              </p>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('admin.resultsPage', { page, totalPages })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                  aria-label={t('common.back')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  aria-label={t('pagination.nextPage', 'Next page')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
