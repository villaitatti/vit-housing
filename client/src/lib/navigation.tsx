import type { Role } from '@vithousing/shared';
import { canUseFavoriteListings } from '@vithousing/shared';
import {
  Building2,
  Heart,
  List,
  Map,
  MapPinned,
  PlusSquare,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
  Mail,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';

export type NavigationVisibilityContext = {
  roles: Role[];
  canFavoriteListings: boolean;
};

export type NavigationSectionId = 'listings' | 'myListings' | 'admin' | 'itAdmin';

export type NavigationSection = {
  id: NavigationSectionId;
  labelKey: string;
};

export type NavigationItem = {
  id: string;
  section: NavigationSectionId;
  labelKey: string;
  icon: LucideIcon;
  href: (lang: string) => string;
  visible: (context: NavigationVisibilityContext) => boolean;
  matches: string[];
  excludeMatches?: string[];
};

type BreadcrumbDefinition = {
  labelKey: string;
  href?: (lang: string) => string;
};

type RouteMetadataDefinition = {
  id: string;
  pattern: string;
  titleKey: string | ((params: Record<string, string>) => string);
  breadcrumbs: (params: Record<string, string>) => BreadcrumbDefinition[];
};

type RouteMetadataMatch = {
  id: string;
  titleKey: string;
  breadcrumbs: BreadcrumbDefinition[];
};

const MANAGED_LISTING_ROLES: Role[] = ['HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'];
const ADMIN_ROLES: Role[] = ['HOUSE_ADMIN', 'HOUSE_IT_ADMIN'];
const IT_ADMIN_ROLES: Role[] = ['HOUSE_IT_ADMIN'];

export const navigationSections: NavigationSection[] = [
  { id: 'listings', labelKey: 'shell.sections.listings' },
  { id: 'myListings', labelKey: 'shell.sections.myListings' },
  { id: 'admin', labelKey: 'shell.sections.admin' },
  { id: 'itAdmin', labelKey: 'shell.sections.itAdmin' },
];

const hasAnyRole = (roles: Role[], requiredRoles: Role[]) =>
  requiredRoles.some((role) => roles.includes(role));

export const navigationItems: NavigationItem[] = [
  {
    id: 'all-listings',
    section: 'listings',
    labelKey: 'shell.nav.allListings',
    icon: Building2,
    href: (lang) => `/${lang}/listings`,
    visible: () => true,
    matches: ['/:lang/listings', '/:lang/listings/:slug'],
    excludeMatches: ['/:lang/listings/new', '/:lang/listings/:slug/edit'],
  },
  {
    id: 'map',
    section: 'listings',
    labelKey: 'nav.map',
    icon: Map,
    href: (lang) => `/${lang}/map`,
    visible: () => true,
    matches: ['/:lang/map'],
  },
  {
    id: 'favorites',
    section: 'listings',
    labelKey: 'nav.favorites',
    icon: Heart,
    href: (lang) => `/${lang}/favorites`,
    visible: (context) => context.canFavoriteListings,
    matches: ['/:lang/favorites'],
  },
  {
    id: 'view-my-listings',
    section: 'myListings',
    labelKey: 'shell.nav.viewMyListings',
    icon: List,
    href: (lang) => `/${lang}/my-listings`,
    visible: (context) => hasAnyRole(context.roles, MANAGED_LISTING_ROLES),
    matches: ['/:lang/my-listings', '/:lang/listings/:slug/edit'],
  },
  {
    id: 'add-new-listing',
    section: 'myListings',
    labelKey: 'shell.nav.addNewListing',
    icon: PlusSquare,
    href: (lang) => `/${lang}/listings/new`,
    visible: (context) => hasAnyRole(context.roles, MANAGED_LISTING_ROLES),
    matches: ['/:lang/listings/new'],
  },
  {
    id: 'admin-listings',
    section: 'admin',
    labelKey: 'shell.nav.viewListings',
    icon: Building2,
    href: (lang) => `/${lang}/admin/listings`,
    visible: (context) => hasAnyRole(context.roles, ADMIN_ROLES),
    matches: ['/:lang/admin/listings'],
  },
  {
    id: 'admin-users',
    section: 'admin',
    labelKey: 'shell.nav.viewUsers',
    icon: Users,
    href: (lang) => `/${lang}/admin/users`,
    visible: (context) => hasAnyRole(context.roles, ADMIN_ROLES),
    matches: ['/:lang/admin/users'],
  },
  {
    id: 'admin-invitations',
    section: 'admin',
    labelKey: 'shell.nav.viewInvitations',
    icon: Mail,
    href: (lang) => `/${lang}/admin/invitations`,
    visible: (context) => hasAnyRole(context.roles, ADMIN_ROLES),
    matches: ['/:lang/admin/invitations'],
  },
  {
    id: 'admin-invite-user',
    section: 'admin',
    labelKey: 'admin.inviteUser',
    icon: UserPlus,
    href: (lang) => `/${lang}/admin/invite-user`,
    visible: (context) => hasAnyRole(context.roles, ADMIN_ROLES),
    matches: ['/:lang/admin/invite-user'],
  },
  {
    id: 'service-auth0',
    section: 'itAdmin',
    labelKey: 'admin.serviceAuth0',
    icon: ShieldCheck,
    href: (lang) => `/${lang}/admin/services/auth0`,
    visible: (context) => hasAnyRole(context.roles, IT_ADMIN_ROLES),
    matches: ['/:lang/admin/services/auth0'],
  },
  {
    id: 'service-ses',
    section: 'itAdmin',
    labelKey: 'admin.serviceSes',
    icon: Send,
    href: (lang) => `/${lang}/admin/services/ses`,
    visible: (context) => hasAnyRole(context.roles, IT_ADMIN_ROLES),
    matches: ['/:lang/admin/services/ses'],
  },
  {
    id: 'service-google-maps',
    section: 'itAdmin',
    labelKey: 'admin.serviceGoogleMaps',
    icon: MapPinned,
    href: (lang) => `/${lang}/admin/services/google_maps`,
    visible: (context) => hasAnyRole(context.roles, IT_ADMIN_ROLES),
    matches: ['/:lang/admin/services/google_maps'],
  },
];

const serviceTitleKey = (service: string) => {
  switch (service) {
    case 'auth0':
      return 'admin.serviceAuth0';
    case 'ses':
      return 'admin.serviceSes';
    case 'google_maps':
      return 'admin.serviceGoogleMaps';
    default:
      return 'admin.serviceConfigTitle';
  }
};

const routeMetadata: RouteMetadataDefinition[] = [
  {
    id: 'home',
    pattern: '/:lang/home',
    titleKey: 'nav.home',
    breadcrumbs: () => [{ labelKey: 'nav.home' }],
  },
  {
    id: 'listings',
    pattern: '/:lang/listings',
    titleKey: 'listings.title',
    breadcrumbs: () => [{ labelKey: 'listings.title' }],
  },
  {
    id: 'new-listing',
    pattern: '/:lang/listings/new',
    titleKey: 'listingForm.createTitle',
    breadcrumbs: () => [
      { labelKey: 'myListings.title', href: (lang) => `/${lang}/my-listings` },
      { labelKey: 'listingForm.createTitle' },
    ],
  },
  {
    id: 'edit-listing',
    pattern: '/:lang/listings/:slug/edit',
    titleKey: 'listingForm.editTitle',
    breadcrumbs: () => [
      { labelKey: 'myListings.title', href: (lang) => `/${lang}/my-listings` },
      { labelKey: 'listingForm.editTitle' },
    ],
  },
  {
    id: 'listing-detail',
    pattern: '/:lang/listings/:slug',
    titleKey: 'shell.pages.listingDetails',
    breadcrumbs: () => [
      { labelKey: 'listings.title', href: (lang) => `/${lang}/listings` },
      { labelKey: 'shell.pages.listingDetails' },
    ],
  },
  {
    id: 'map',
    pattern: '/:lang/map',
    titleKey: 'nav.map',
    breadcrumbs: () => [{ labelKey: 'nav.map' }],
  },
  {
    id: 'favorites',
    pattern: '/:lang/favorites',
    titleKey: 'favorites.title',
    breadcrumbs: () => [{ labelKey: 'favorites.title' }],
  },
  {
    id: 'my-listings',
    pattern: '/:lang/my-listings',
    titleKey: 'myListings.title',
    breadcrumbs: () => [{ labelKey: 'myListings.title' }],
  },
  {
    id: 'profile',
    pattern: '/:lang/profile',
    titleKey: 'profile.title',
    breadcrumbs: () => [{ labelKey: 'profile.title' }],
  },
  {
    id: 'admin-listings',
    pattern: '/:lang/admin/listings',
    titleKey: 'admin.listings',
    breadcrumbs: () => [
      { labelKey: 'shell.sections.admin' },
      { labelKey: 'admin.listings' },
    ],
  },
  {
    id: 'admin-users',
    pattern: '/:lang/admin/users',
    titleKey: 'admin.users',
    breadcrumbs: () => [
      { labelKey: 'shell.sections.admin' },
      { labelKey: 'admin.users' },
    ],
  },
  {
    id: 'admin-invitations',
    pattern: '/:lang/admin/invitations',
    titleKey: 'admin.invitations',
    breadcrumbs: () => [
      { labelKey: 'shell.sections.admin' },
      { labelKey: 'admin.invitations' },
    ],
  },
  {
    id: 'admin-invite-user',
    pattern: '/:lang/admin/invite-user',
    titleKey: 'admin.inviteTitle',
    breadcrumbs: () => [
      { labelKey: 'shell.sections.admin' },
      { labelKey: 'admin.inviteUser' },
    ],
  },
  {
    id: 'admin-service',
    pattern: '/:lang/admin/services/:service',
    titleKey: (params) => serviceTitleKey(params.service ?? ''),
    breadcrumbs: (params) => [
      { labelKey: 'shell.sections.itAdmin' },
      { labelKey: serviceTitleKey(params.service ?? '') },
    ],
  },
];

export function getNavigationVisibilityContext(roles: Role[] = []): NavigationVisibilityContext {
  return {
    roles,
    canFavoriteListings: canUseFavoriteListings(roles),
  };
}

export function getVisibleNavigationSections(context: NavigationVisibilityContext) {
  return navigationSections
    .map((section) => ({
      ...section,
      items: navigationItems.filter((item) => item.section === section.id && item.visible(context)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isNavigationItemActive(item: NavigationItem, pathname: string) {
  const isIncluded = item.matches.some((pattern) => Boolean(matchPath({ path: pattern, end: true }, pathname)));
  const isExcluded = item.excludeMatches?.some((pattern) => Boolean(matchPath({ path: pattern, end: true }, pathname)));

  return isIncluded && !isExcluded;
}

export function getRouteMetadata(pathname: string): RouteMetadataMatch | null {
  for (const definition of routeMetadata) {
    const match = matchPath({ path: definition.pattern, end: true }, pathname);

    if (!match) {
      continue;
    }

    const params = match.params as Record<string, string>;

    return {
      id: definition.id,
      titleKey:
        typeof definition.titleKey === 'function' ? definition.titleKey(params) : definition.titleKey,
      breadcrumbs: definition.breadcrumbs(params),
    };
  }

  return null;
}
