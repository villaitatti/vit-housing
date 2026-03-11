import { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { SearchX, MapIcon } from 'lucide-react';
import { canUseFavoriteListings } from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { getListingDetailPath } from '@/lib/listingPaths';
import { ListingCard } from '@/components/listings/ListingCard';
import { FavoriteListingDialog } from '@/components/listings/FavoriteListingDialog';
import { ListingFilters, type FiltersState } from '@/components/listings/ListingFilters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useFavoriteMutations } from '@/hooks/useFavoriteMutations';
import type { PaginatedData } from '@vithousing/shared';

interface ListingsListItem {
  id: number;
  slug: string;
  title: string;
  address_1: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  created_at: string;
  is_favorite: boolean;
  photos?: { url: string }[];
}

type ListingsResponse = PaginatedData<ListingsListItem>;
type ListingQueryFilters = FiltersState & { limit: string };
type FavoriteDialogState = { mode: 'add' | 'remove'; listing: ListingsListItem } | null;

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
  borderRadius: '0.5rem',
};

const DEFAULT_CENTER = {
  lat: 43.7696,
  lng: 11.2558, // Florence, Italy
};

export function MapSearchPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang || 'en';
  const { user } = useAuth();
  const canFavoriteListings = canUseFavoriteListings(user?.roles ?? []);
  const { addFavorite, removeFavorite, isAddingFavorite, isRemovingFavorite } = useFavoriteMutations();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeListing, setActiveListing] = useState<ListingsListItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [favoriteDialog, setFavoriteDialog] = useState<FavoriteDialogState>(null);

  // 1. Fetch Google Maps API Key from Public Config
  const { data: configData } = useQuery({
    queryKey: queryKeys.config.public,
    queryFn: async () => {
      const res = await api.get('/api/v1/config/public');
      return res.data;
    },
    staleTime: Infinity,
  });

  const googleMapsApiKey = configData?.google_maps?.client_api_key;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey || '',
  });

  // 2. Map Filtering Logic
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
      limit: '1000', // Fetch max items to show on the map
    }),
    [searchParams],
  );


  const { data: listingsData, isLoading: isLoadingListings } = useQuery<ListingsResponse>({
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

  const listingsWithCoords = useMemo(() => {
    return (listingsData?.items || []).filter(l => l.latitude !== null && l.longitude !== null);
  }, [listingsData?.items]);

  const updateFilters = (newFilters: FiltersState) => {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...newFilters, limit: '1000' }).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setSearchParams(params);
    setActiveListing(null);
  };

  const clearFilters = () => {
    setSearchParams({});
    setActiveListing(null);
  };

  const [map, setMap] = useState<google.maps.Map | null>(null);

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback() {
    setMap(null);
  }, []);

  // Recenter map or adjust bounds when listings change
  useEffect(() => {
    if (map && listingsWithCoords.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      listingsWithCoords.forEach((listing) => {
        bounds.extend({ lat: Number(listing.latitude), lng: Number(listing.longitude) });
      });
      map.fitBounds(bounds);
    }
  }, [map, listingsWithCoords]);

  const handleFavoriteConfirm = async (note: string) => {
    if (!favoriteDialog) {
      return;
    }

    if (favoriteDialog.mode === 'add') {
      await addFavorite({ listingId: favoriteDialog.listing.id, note });
    }

    if (favoriteDialog.mode === 'remove') {
      await removeFavorite({ listingId: favoriteDialog.listing.id });
    }

    setFavoriteDialog(null);
  };

  const isFavoriteDialogPending = favoriteDialog?.mode === 'add' ? isAddingFavorite : isRemovingFavorite;

  // Loading States
  if (!googleMapsApiKey) {
    return (
      <div className="container mx-auto flex flex-1 items-center justify-center px-4 py-16 text-center">
         <div className="flex flex-col items-center">
           <MapIcon className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
           <p className="text-xl font-medium text-muted-foreground">Map is not configured.</p>
           <p className="text-sm text-muted-foreground mt-2">Please ask an admin to set up the Google Maps service.</p>
         </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-md">
          {t('common.error')}: Could not load Google Maps script.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex-none border-b bg-card px-6 py-4">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            {listingsWithCoords.length} {listingsWithCoords.length === 1 ? 'result' : 'results'} found.
          </p>

          <div className="flex items-center space-x-2">
            <Label htmlFor="toggle-filters" className="cursor-pointer">{t('listings.filters')}</Label>
            <Switch
              id="toggle-filters"
              checked={showFilters}
              onCheckedChange={setShowFilters}
            />
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Filters Panel (Slide Overlay on Mobile, Push on Desktop) */}
        <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ 
              width: showFilters ? 300 : 0, 
              opacity: showFilters ? 1 : 0 
            }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={`border-r bg-muted/40 overflow-y-auto shrink-0 ${!showFilters ? 'invisible' : 'visible'}`}
        >
          <div className="p-4 w-[300px]">
            <ListingFilters
              filters={filters}
              onChange={updateFilters}
              onClear={clearFilters}
            />
          </div>
        </motion.div>

        {/* Map View */}
        <div className="flex-1 relative z-0 h-full">
            {isLoadingListings && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            )}
            
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={DEFAULT_CENTER}
                zoom={12}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                  disableDefaultUI: false,
                  zoomControl: true,
                  streetViewControl: true,
                  mapTypeControl: false,
                  styles: [ // Optional a stylish silver/light map
                    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#747474' }] },
                    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
                    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
                  ]
                }}
              >
                {listingsWithCoords.map((listing) => (
                  <MarkerF
                    key={listing.id}
                    position={{ lat: Number(listing.latitude), lng: Number(listing.longitude) }}
                    onClick={() => setActiveListing(listing)}
                    icon={{
                      url: `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" fill="${activeListing?.id === listing.id ? '%23db2777' : '%232563eb'}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
                      scaledSize: new window.google.maps.Size(36, 36),
                    }}
                  />
                ))}

                {activeListing && activeListing.latitude && activeListing.longitude && (
                  <InfoWindowF
                    position={{ lat: Number(activeListing.latitude), lng: Number(activeListing.longitude) }}
                    onCloseClick={() => setActiveListing(null)}
                    options={{
                      disableAutoPan: false,
                    }}
                  >
                    <div className="p-1 max-w-[200px]">
                      {activeListing.photos && activeListing.photos.length > 0 && (
                        <div className="w-full h-32 mb-2 rounded overflow-hidden">
                          <img 
                            src={activeListing.photos[0].url} 
                            alt={activeListing.title} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                      )}
                      <h3 className="font-semibold text-sm mb-1 line-clamp-2">{activeListing.title}</h3>
                      <p className="text-primary font-medium text-sm mb-2 hover:underline">
                        €{activeListing.monthly_rent} <span className="text-muted-foreground font-normal text-xs">{t('listings.perMonth')}</span>
                      </p>
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => window.open(getListingDetailPath(currentLang, activeListing.slug), '_blank')}
                      >
                         {t('listings.viewListing')}
                      </Button>
                    </div>
                  </InfoWindowF>
                )}
              </GoogleMap>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                 <Skeleton className="w-full h-full rounded-none" />
              </div>
            )}
        </div>

        {/* List View Sidebar */}
        <div className="w-full md:w-[350px] lg:w-[450px] bg-background border-l flex flex-col h-[40vh] md:h-full shrink-0">
          <div className="p-4 border-b bg-muted/20">
             <h2 className="font-semibold">Results</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
             {isLoadingListings ? (
               Array.from({ length: 4 }).map((_, i) => (
                 <div key={i} className="space-y-3">
                   <Skeleton className="h-32 w-full rounded-lg" />
                   <Skeleton className="h-4 w-3/4" />
                 </div>
               ))
             ) : listingsWithCoords.length === 0 ? (
                 <div className="mt-10 mx-auto flex max-w-xs flex-col items-center text-center">
                   <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 ring-8 ring-orange-50 dark:bg-orange-900/30 dark:ring-orange-900/10">
                     <SearchX className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                   </div>
                   <h3 className="text-lg font-semibold tracking-tight">{t('listings.noFilterResults')}</h3>
                   <Button variant="outline" className="mt-4" onClick={clearFilters}>
                     {t('listings.clearFilters')}
                   </Button>
                 </div>
             ) : (
               <motion.div
                 initial="hidden"
                 animate="visible"
                 variants={{
                   hidden: {},
                   visible: { transition: { staggerChildren: 0.05 } },
                 }}
                 className="space-y-4"
               >
                 {listingsWithCoords.map((listing) => (
                 <motion.div
                     key={listing.id}
                     variants={{
                       hidden: { opacity: 0, x: 20 },
                       visible: { opacity: 1, x: 0 },
                     }}
                     onMouseEnter={() => setActiveListing(listing)}
                     onMouseLeave={() => setActiveListing(null)}
                     className={`cursor-pointer transition-all duration-200 ${activeListing?.id === listing.id ? 'ring-2 ring-primary rounded-xl scale-[1.02] shadow-md z-10 relative' : ''}`}
                   >
                    {canFavoriteListings ? (
                      <ListingCard
                        listing={listing}
                        lang={lang || 'en'}
                        openInNewTab
                        showFavoriteButton
                        onFavoriteClick={(targetListing) => setFavoriteDialog({
                          mode: targetListing.is_favorite ? 'remove' : 'add',
                          listing: targetListing,
                        })}
                      />
                    ) : (
                      <ListingCard
                        listing={listing}
                        lang={lang || 'en'}
                        openInNewTab
                      />
                    )}
                  </motion.div>
                 ))}
               </motion.div>
             )}
          </div>
        </div>
      </div>

      {favoriteDialog ? (
        <FavoriteListingDialog
          key={`${favoriteDialog.mode}-${favoriteDialog.listing.id}`}
          open
          mode={favoriteDialog.mode}
          listingTitle={favoriteDialog.listing.title}
          isPending={isFavoriteDialogPending}
          onClose={() => setFavoriteDialog(null)}
          onConfirm={handleFavoriteConfirm}
        />
      ) : null}
    </div>
  );
}
