import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2, SearchX } from 'lucide-react';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListingFilters, type FiltersState } from '@/components/listings/ListingFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { PaginatedData } from '@vithousing/shared';

interface ListingsListItem {
  id: number;
  slug: string;
  title: string;
  address_1: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  created_at: string;
  photos?: { url: string }[];
}

type ListingsResponse = PaginatedData<ListingsListItem>;
type ListingQueryFilters = FiltersState & { page: string };

export function ListingsPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<ListingQueryFilters>(
    () => ({
      minRent: searchParams.get('minRent') || undefined,
      maxRent: searchParams.get('maxRent') || undefined,
      minBedrooms: searchParams.get('minBedrooms') || undefined,
      maxBedrooms: searchParams.get('maxBedrooms') || undefined,
      minBathrooms: searchParams.get('minBathrooms') || undefined,
      maxBathrooms: searchParams.get('maxBathrooms') || undefined,
      minFloorSpace: searchParams.get('minFloorSpace') || undefined,
      maxFloorSpace: searchParams.get('maxFloorSpace') || undefined,
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: searchParams.get('sortOrder') || 'desc',
      page: searchParams.get('page') || '1',
    }),
    [searchParams],
  );

  const hasActiveFilters = useMemo(() => {
    const filterKeys = [
      'minRent', 'maxRent', 'minBedrooms', 'maxBedrooms',
      'minBathrooms', 'maxBathrooms', 'minFloorSpace', 'maxFloorSpace',
    ];
    return filterKeys.some((key) => searchParams.has(key));
  }, [searchParams]);

  const { data, isLoading } = useQuery<ListingsResponse>({
    queryKey: queryKeys.listings.list(filters),
    queryFn: async () => {
      const params: Record<string, string> = {};
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      const res = await api.get('/api/v1/listings', { params });
      return res.data;
    },
  });

  const updateFilters = (newFilters: FiltersState) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...newFilters, page: '1' }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(page));
    setSearchParams(params);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">{t('listings.title')}</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Filters sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <ListingFilters
            filters={filters}
            onChange={updateFilters}
            onClear={clearFilters}
          />
        </aside>

        {/* Listings grid */}
        <div className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-48 w-full rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : data?.items?.length === 0 ? (
            hasActiveFilters ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/30 via-background to-muted/50 px-6 py-14">
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 ring-8 ring-orange-50 dark:bg-orange-900/30 dark:ring-orange-900/10">
                    <SearchX className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">{t('listings.noFilterResults')}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t('listings.noFilterResultsDescription')}</p>
                  <Button variant="outline" className="mt-6" onClick={clearFilters}>
                    {t('listings.clearFilters')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-gradient-to-br from-muted/30 via-background to-muted/50 px-6 py-14">
                <div className="mx-auto flex max-w-md flex-col items-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-8 ring-primary/5">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">{t('listings.noListings')}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t('listings.noListingsDescription')}</p>
                </div>
              </div>
            )
          ) : (
            <>
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.06 } },
                }}
              >
                {data?.items?.map((listing) => (
                  <motion.div
                    key={listing.id}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <ListingCard listing={listing} lang={lang || 'en'} />
                  </motion.div>
                ))}
              </motion.div>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => goToPage(data.page - 1)}
                  >
                    {t('common.back')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {data.page} / {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() => goToPage(data.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
