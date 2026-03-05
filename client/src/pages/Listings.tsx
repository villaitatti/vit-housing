import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListingFilters, type FiltersState } from '@/components/listings/ListingFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { PaginatedData } from '@vithousing/shared';

interface ListingsListItem {
  id: number;
  title: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  created_at: string;
  photos?: { s3_url: string }[];
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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-1">{t('listings.noListings')}</h3>
              <p className="text-sm text-muted-foreground">{t('listings.noListingsDescription')}</p>
            </div>
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
