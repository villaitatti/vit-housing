import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingCard } from '@/components/listings/ListingCard';
import { MANAGED_LISTING_ROLES } from '@vithousing/shared';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import type { PaginatedData } from '@vithousing/shared';

interface HomeListing {
  id: number;
  slug: string;
  title: string;
  address_1: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  photos?: { url: string }[];
}

export function HomePage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { user } = useAuth();
  const canAddListing = user?.roles?.some((role) =>
    MANAGED_LISTING_ROLES.some((managedRole) => managedRole === role),
  );

  const { data, isLoading } = useQuery<PaginatedData<HomeListing>>({
    queryKey: queryKeys.listings.latest,
    queryFn: async () => {
      const res = await api.get('/api/v1/listings', {
        params: { sortBy: 'created_at', sortOrder: 'desc', limit: 6 },
      });
      return res.data;
    },
    retry: false,
  });

  return (
    <div>
      {/* Hero Section */}
      <motion.section
        className="bg-gradient-to-b from-primary/5 to-background py-12 md:py-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="container mx-auto px-4 text-center">
          <motion.p
            className="mb-3 text-sm font-semibold tracking-[0.12em] text-primary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            {t('home.welcomeTo')}
          </motion.p>
          <motion.h2
            className="mx-auto mb-8 max-w-3xl text-3xl font-bold tracking-tight text-foreground md:text-5xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {t('home.portalTitle')}
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <Button asChild size="lg">
              <Link to={canAddListing ? `/${lang}/listings/new` : `/${lang}/listings`}>
                {canAddListing ? t('listingForm.createTitle') : t('shell.nav.allListings')}
                {canAddListing ? <PlusSquare className="ml-2 h-4 w-4" /> : <ArrowRight className="ml-2 h-4 w-4" />}
              </Link>
            </Button>
          </motion.div>
        </div>
      </motion.section>

      {/* Disclaimer */}
      <section className="container mx-auto px-4 py-12">
        <Card>
          <CardContent className="p-6 md:p-8">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {t('home.disclaimer')}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Latest Listings */}
      <section className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">{t('home.latestListings')}</h2>
          <Button variant="outline" asChild>
            <Link to={`/${lang}/listings`}>
              {t('home.viewAll')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

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
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
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
        )}
      </section>
    </div>
  );
}
