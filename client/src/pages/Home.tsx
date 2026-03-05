import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingCard } from '@/components/listings/ListingCard';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { PaginatedData } from '@vithousing/shared';

interface HomeListing {
  id: number;
  title: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  photos?: { s3_url: string }[];
}

export function HomePage() {
  const { t } = useTranslation();
  const { lang } = useParams();

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
        className="bg-gradient-to-b from-primary/5 to-background py-16 md:py-24"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="container mx-auto px-4 text-center">
          <motion.h1
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            {t('home.welcome')}
          </motion.h1>
          <motion.p
            className="text-xl text-muted-foreground mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {t('common.appName')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <Button asChild size="lg">
              <Link to={`/${lang}/listings`}>
                {t('home.viewAll')}
                <ArrowRight className="ml-2 h-4 w-4" />
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
