import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  HelpCircle,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { Fragment, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  getRouteMetadata,
  getVisibleNavigationSections,
  getNavigationVisibilityContext,
  isNavigationItemActive,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { LanguageSwitch } from './LanguageSwitch';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BROWSER_APP_NAME = 'I Tatti Housing Offers';

function SidebarNavigation() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { collapsed, isMobile, setMobileOpen } = useSidebar();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const visibilityContext = getNavigationVisibilityContext(user?.roles ?? []);
  const sections = getVisibleNavigationSections(visibilityContext);

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase();

  const closeMobileSidebar = () => {
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      <SidebarHeader className="px-4 py-5">
        <Link
          to={`/${currentLang}/home`}
          onClick={closeMobileSidebar}
          className={cn(
            'group flex gap-2 rounded-2xl border border-transparent p-2 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70',
            collapsed && !isMobile ? 'justify-center' : 'flex-col items-start',
          )}
        >
          <img
            src="/horizontal-simple-itatti-logo1.png"
            alt="Villa I Tatti"
            className={cn('h-auto shrink-0 object-contain', collapsed && !isMobile ? 'w-10' : 'w-40')}
          />
          {collapsed && !isMobile ? null : (
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-[0.02em] text-primary">
                {t('shell.logoSubtitle')}
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="space-y-6 px-3 py-4">
        {sections.map((section) => (
          <div key={section.id} className="space-y-2">
            {collapsed && !isMobile ? null : (
              <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t(section.labelKey)}
              </div>
            )}

            <nav className="space-y-1.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationItemActive(item, location.pathname);

                return (
                  <Link
                    key={item.id}
                    to={item.href(currentLang)}
                    onClick={closeMobileSidebar}
                    title={collapsed && !isMobile ? t(item.labelKey) : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      collapsed && !isMobile ? 'justify-center' : '',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {collapsed && !isMobile ? null : <span className="truncate">{t(item.labelKey)}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="space-y-3 px-3 py-3">
        <div
          className={cn(
            'rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-3',
            collapsed && !isMobile ? 'flex justify-center p-2.5' : 'space-y-3',
          )}
        >
          <div className={cn('flex items-start gap-3', collapsed && !isMobile ? 'justify-center' : '')}>
            <div className="rounded-xl bg-background p-2 text-primary shadow-sm">
              <HelpCircle className="h-4 w-4" />
            </div>
            {collapsed && !isMobile ? null : (
              <div className="space-y-1">
                <div className="font-medium">{t('shell.support.title')}</div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t('shell.support.body')}
                </p>
              </div>
            )}
          </div>
          {collapsed && !isMobile ? null : (
            <Button type="button" variant="outline" className="w-full" disabled>
              {t('shell.support.cta')}
            </Button>
          )}
        </div>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-background px-3 py-3 text-left shadow-sm transition-colors hover:bg-sidebar-accent/70',
                  collapsed && !isMobile ? 'justify-center px-2 py-2.5' : '',
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials || 'IT'}</AvatarFallback>
                </Avatar>
                {collapsed && !isMobile ? null : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {user.first_name} {user.last_name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64">
              <div className="px-2 py-1.5">
                <div className="font-medium">
                  {user.first_name} {user.last_name}
                </div>
                <div className="text-xs text-muted-foreground">{user.email}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={`/${currentLang}/profile`} onClick={closeMobileSidebar}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  {t('nav.profile')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  closeMobileSidebar();
                  logout();
                }}
                variant="destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </SidebarFooter>
    </>
  );
}

function ProtectedShellFrame() {
  const { t } = useTranslation();
  const location = useLocation();
  const { lang } = useParams();
  const { setMobileOpen } = useSidebar();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const routeMetadata = getRouteMetadata(location.pathname);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  const title = routeMetadata ? t(routeMetadata.titleKey) : t('common.appName');
  const isMapRoute = routeMetadata?.id === 'map';

  useEffect(() => {
    document.title = routeMetadata ? `${title} | ${BROWSER_APP_NAME}` : BROWSER_APP_NAME;
  }, [routeMetadata, title]);

  const breadcrumbItems = useMemo(
    () =>
      (routeMetadata?.breadcrumbs ?? []).map((item) => ({
        label: t(item.labelKey),
        href: item.href ? item.href(currentLang) : undefined,
      })),
    [currentLang, routeMetadata, t],
  );

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,rgba(229,234,236,0.35),rgba(255,255,255,0)_220px)]">
      <Sidebar>
        <SidebarNavigation />
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="flex items-start justify-between gap-4 px-4 py-4 lg:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <SidebarTrigger className="mt-1" />
              <div className="min-w-0">
                {breadcrumbItems.length > 0 ? (
                  <Breadcrumb>
                    <BreadcrumbList>
                      {breadcrumbItems.map((item, index) => (
                        <Fragment key={`${item.label}-${index}`}>
                          <BreadcrumbItem>
                            {item.href && index !== breadcrumbItems.length - 1 ? (
                              <Link to={item.href} className="transition-colors hover:text-foreground">
                                {item.label}
                              </Link>
                            ) : (
                              <BreadcrumbPage>{item.label}</BreadcrumbPage>
                            )}
                          </BreadcrumbItem>
                          {index < breadcrumbItems.length - 1 ? <BreadcrumbSeparator /> : null}
                        </Fragment>
                      ))}
                    </BreadcrumbList>
                  </Breadcrumb>
                ) : null}
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              </div>
            </div>

            <LanguageSwitch className="shrink-0" buttonClassName="rounded-full border border-border px-3" />
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className={cn('flex min-h-0 flex-1 flex-col', isMapRoute ? 'overflow-hidden' : '')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </SidebarInset>
    </div>
  );
}

export function ProtectedShell() {
  return (
    <SidebarProvider>
      <ProtectedShellFrame />
    </SidebarProvider>
  );
}
