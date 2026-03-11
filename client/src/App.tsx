import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Auth0Provider } from '@auth0/auth0-react';
import { Toaster } from '@/components/ui/sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { ProtectedRoute } from '@/components/guards/ProtectedRoute';
import { RoleGuard } from '@/components/guards/RoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { FAVORITE_LISTING_ROLES } from '@vithousing/shared';
import './lib/i18n';

// Lazy-loaded pages for code splitting
const HomePage = lazy(() => import('@/pages/Home').then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import('@/pages/Login').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/Register').then((m) => ({ default: m.RegisterPage })));
const ListingsPage = lazy(() => import('@/pages/Listings').then((m) => ({ default: m.ListingsPage })));
const ListingDetailPage = lazy(() => import('@/pages/ListingDetail').then((m) => ({ default: m.ListingDetailPage })));
const MapSearchPage = lazy(() => import('@/pages/MapSearch').then((m) => ({ default: m.MapSearchPage })));
const FavoritesPage = lazy(() => import('@/pages/Favorites').then((m) => ({ default: m.FavoritesPage })));
const NewListingPage = lazy(() => import('@/pages/NewListing').then((m) => ({ default: m.NewListingPage })));
const EditListingPage = lazy(() => import('@/pages/EditListing').then((m) => ({ default: m.EditListingPage })));
const MyListingsPage = lazy(() => import('@/pages/MyListings').then((m) => ({ default: m.MyListingsPage })));
const ProfilePage = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.ProfilePage })));
const AdminListingsPage = lazy(() => import('@/pages/admin/AdminListings').then((m) => ({ default: m.AdminListingsPage })));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsersPage })));
const InviteUserPage = lazy(() => import('@/pages/admin/InviteUser').then((m) => ({ default: m.InviteUserPage })));
const AdminInvitationsPage = lazy(() => import('@/pages/admin/AdminInvitations').then((m) => ({ default: m.AdminInvitationsPage })));
const ServiceConfigPage = lazy(() => import('@/pages/admin/ServiceConfig').then((m) => ({ default: m.ServiceConfigPage })));

function PageLoader() {
  return (
    <div className="container mx-auto p-8 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN || ''}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID || ''}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/en/login" replace />} />

            <Route path="/:lang" element={<AppLayout />}>
              {/* Public routes */}
              <Route path="login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
              <Route path="register" element={<Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>} />

              <Route
                element={
                  <ProtectedRoute>
                    <ProtectedShell />
                  </ProtectedRoute>
                }
              >
                <Route path="home" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
                <Route path="listings" element={<Suspense fallback={<PageLoader />}><ListingsPage /></Suspense>} />
                <Route path="map" element={<Suspense fallback={<PageLoader />}><MapSearchPage /></Suspense>} />
                <Route
                  path="favorites"
                  element={
                    <RoleGuard roles={[...FAVORITE_LISTING_ROLES]}>
                      <Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>
                    </RoleGuard>
                  }
                />
                <Route
                  path="listings/new"
                  element={
                    <RoleGuard roles={['HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN']}>
                      <Suspense fallback={<PageLoader />}><NewListingPage /></Suspense>
                    </RoleGuard>
                  }
                />
                <Route
                  path="listings/:slug/edit"
                  element={
                    <RoleGuard roles={['HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN']}>
                      <Suspense fallback={<PageLoader />}><EditListingPage /></Suspense>
                    </RoleGuard>
                  }
                />
                <Route path="listings/:slug" element={<Suspense fallback={<PageLoader />}><ListingDetailPage /></Suspense>} />
                <Route
                  path="my-listings"
                  element={
                    <RoleGuard roles={['HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN']}>
                      <Suspense fallback={<PageLoader />}><MyListingsPage /></Suspense>
                    </RoleGuard>
                  }
                />
                <Route path="profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />

                <Route
                  path="admin"
                  element={
                    <RoleGuard roles={['HOUSE_ADMIN', 'HOUSE_IT_ADMIN']}>
                      <Outlet />
                    </RoleGuard>
                  }
                >
                  <Route index element={<Navigate to="listings" replace />} />
                  <Route path="listings" element={<Suspense fallback={<PageLoader />}><AdminListingsPage /></Suspense>} />
                  <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsersPage /></Suspense>} />
                  <Route path="invitations" element={<Suspense fallback={<PageLoader />}><AdminInvitationsPage /></Suspense>} />
                  <Route path="invite-user" element={<Suspense fallback={<PageLoader />}><InviteUserPage /></Suspense>} />
                  <Route
                    path="services/:service"
                    element={
                      <RoleGuard roles={['HOUSE_IT_ADMIN']}>
                        <Suspense fallback={<PageLoader />}><ServiceConfigPage /></Suspense>
                      </RoleGuard>
                    }
                  />
                </Route>
              </Route>
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/en/login" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </Auth0Provider>
  );
}

export default App;
