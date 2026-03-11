import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  HelpCircle,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/avatar';

const BROWSER_APP_NAME = 'I Tatti Housing Offers';

function CollapsedSidebarLabel({
  enabled,
  label,
  children,
}: {
  enabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={14}
        className="relative w-auto rounded-[1.15rem] border-0 bg-foreground px-4 py-2 text-sm font-medium text-background shadow-xl before:absolute before:left-0 before:top-1/2 before:h-3 before:w-3 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-foreground"
      >
        <span className="whitespace-nowrap">{label}</span>
      </PopoverContent>
    </Popover>
  );
}

function SidebarNavigation() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { collapsed, isMobile, setMobileOpen } = useSidebar();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const visibilityContext = getNavigationVisibilityContext(user?.roles ?? []);
  const sections = getVisibleNavigationSections(visibilityContext);

  const initials = getInitials(user?.first_name, user?.last_name);

  const closeMobileSidebar = () => {
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      <SidebarHeader className="px-4 py-3 lg:py-2.5">
        <Link
          to={`/${currentLang}/home`}
          onClick={closeMobileSidebar}
          className={cn(
            'group flex gap-1.5 rounded-2xl border border-transparent p-1.5 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70',
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

      <SidebarContent className="space-y-7 px-3 pt-4 pb-4">
        {sections.map((section, index) => (
          <div key={section.id} className={cn('space-y-3', index === 0 ? 'pt-1' : '')}>
            {collapsed && !isMobile ? null : (
              <div className="px-3 text-sm font-semibold tracking-tight text-sidebar-foreground/65">
                {t(section.labelKey)}
              </div>
            )}

            <nav className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationItemActive(item, location.pathname);
                const itemLabel = t(item.labelKey);

                return (
                  <CollapsedSidebarLabel
                    key={item.id}
                    enabled={collapsed && !isMobile}
                    label={itemLabel}
                  >
                    <Link
                      to={item.href(currentLang)}
                      onClick={closeMobileSidebar}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        collapsed && !isMobile ? 'justify-center' : '',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {collapsed && !isMobile ? null : <span className="truncate">{itemLabel}</span>}
                    </Link>
                  </CollapsedSidebarLabel>
                );
              })}
            </nav>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="space-y-3 px-3 py-3">
        <div className="space-y-1 px-1">
          <CollapsedSidebarLabel
            enabled={collapsed && !isMobile}
            label={t('shell.support.title')}
          >
            <button
              type="button"
              disabled
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-medium text-sidebar-foreground/80 transition-colors',
                collapsed && !isMobile ? 'justify-center px-1.5' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <HelpCircle className="h-4 w-4 shrink-0" />
              {collapsed && !isMobile ? null : <span>{t('shell.support.title')}</span>}
            </button>
          </CollapsedSidebarLabel>
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
                  {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} /> : null}
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
  const { setMobileOpen } = useSidebar();
  const routeMetadata = getRouteMetadata(location.pathname);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  const title = routeMetadata ? t(routeMetadata.titleKey) : t('common.appName');
  const isMapRoute = routeMetadata?.id === 'map';

  useEffect(() => {
    document.title = routeMetadata ? `${title} | ${BROWSER_APP_NAME}` : BROWSER_APP_NAME;
  }, [routeMetadata, title]);

  return (
    <div className="flex min-h-screen bg-[linear-gradient(180deg,rgba(229,234,236,0.35),rgba(255,255,255,0)_220px)] lg:h-screen lg:overflow-hidden">
      <Sidebar>
        <SidebarNavigation />
      </Sidebar>

      <SidebarInset className="bg-background lg:overflow-hidden">
        <header className="sticky top-0 z-30 shrink-0 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="flex items-start justify-between gap-4 px-4 pt-8 pb-4 lg:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <SidebarTrigger className="mt-1" />
              <div className="min-w-0">
                <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
              </div>
            </div>

            <LanguageSwitch className="shrink-0" buttonClassName="rounded-full border border-border px-3" />
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className={cn(
              'flex min-h-0 flex-1 flex-col lg:overflow-y-auto',
              isMapRoute ? 'overflow-hidden' : 'overflow-visible',
            )}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {isMapRoute ? (
              <Outlet />
            ) : (
              <div className="flex min-h-full flex-1 flex-col px-4 pt-6 pb-4 lg:px-6 lg:pt-7 lg:pb-5">
                <Outlet />
              </div>
            )}
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
