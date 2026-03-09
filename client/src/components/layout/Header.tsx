import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Home, Building2, Plus, List, Shield, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

function LanguageFlag({ lang }: { lang: 'en' | 'it' }) {
  if (lang === 'it') {
    return (
      <span
        aria-hidden
        className="h-3.5 w-5 rounded-[2px] border border-black/15 bg-[linear-gradient(to_right,#009246_33.33%,#ffffff_33.33%,#ffffff_66.66%,#ce2b37_66.66%)]"
      />
    );
  }

  return (
    <span aria-hidden className="relative h-3.5 w-5 overflow-hidden rounded-[2px] border border-black/15">
      <span className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,#b22234_0_7.69%,#ffffff_7.69%_15.38%)]" />
      <span className="absolute left-0 top-0 h-[53.85%] w-2/5 bg-[#3c3b6e]" />
    </span>
  );
}

export function Header() {
  const { lang } = useParams();
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentLang: 'en' | 'it' = lang === 'it' ? 'it' : 'en';
  const otherLang: 'en' | 'it' = currentLang === 'en' ? 'it' : 'en';

  const switchLanguage = () => {
    const newPath = location.pathname.replace(`/${currentLang}`, `/${otherLang}`);
    navigate(newPath + location.search);
  };

  const canAddListing = user?.roles?.some(r => ['HOUSE_LANDLORD', 'HOUSE_ADMIN', 'HOUSE_IT_ADMIN'].includes(r));
  const isAdmin = user?.roles?.some(r => ['HOUSE_ADMIN', 'HOUSE_IT_ADMIN'].includes(r));
  const homePath = `/${currentLang}/home`;
  const listingsPath = `/${currentLang}/listings`;
  const newListingPath = `/${currentLang}/listings/new`;
  const myListingsPath = `/${currentLang}/my-listings`;
  const mapPath = `/${currentLang}/map`;
  const adminPath = `/${currentLang}/admin`;

  const navLinkClass = (isActive: boolean) =>
    cn(
      'text-sm font-medium transition-colors',
      isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to={homePath} className="flex items-center gap-2 font-semibold text-lg">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="hidden sm:inline">{t('common.appName')}</span>
          </Link>

          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-4">
              <Link
                to={homePath}
                className={navLinkClass(location.pathname === homePath)}
              >
                <span className="flex items-center gap-1.5">
                  <Home className="h-4 w-4" />
                  {t('nav.home')}
                </span>
              </Link>
              <Link
                to={listingsPath}
                className={navLinkClass(
                  location.pathname.startsWith(listingsPath) && location.pathname !== newListingPath,
                )}
              >
                {t('nav.listings')}
              </Link>
              <Link
                to={mapPath}
                className={navLinkClass(location.pathname === mapPath)}
              >
                {t('nav.map')}
              </Link>
              {canAddListing && (
                <>
                  <Link
                    to={myListingsPath}
                    className={navLinkClass(location.pathname === myListingsPath)}
                  >
                    <span className="flex items-center gap-1.5">
                      <List className="h-4 w-4" />
                      {t('nav.myListings')}
                    </span>
                  </Link>
                  <Link
                    to={newListingPath}
                    className={navLinkClass(location.pathname === newListingPath)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Plus className="h-4 w-4" />
                      {t('nav.addListing')}
                    </span>
                  </Link>
                </>
              )}
              {isAdmin && (
                <Link
                  to={`${adminPath}/listings`}
                  className={navLinkClass(location.pathname.startsWith(adminPath))}
                >
                  <span className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4" />
                    {t('nav.admin')}
                  </span>
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={switchLanguage} className="gap-1.5">
            <LanguageFlag lang={otherLang} />
            {otherLang.toUpperCase()}
          </Button>

          {isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {user.first_name[0]}
                      {user.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={`/${currentLang}/profile`} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    {t('nav.profile')}
                  </Link>
                </DropdownMenuItem>
                {canAddListing && (
                  <DropdownMenuItem asChild>
                    <Link to={myListingsPath} className="cursor-pointer">
                      <List className="mr-2 h-4 w-4" />
                      {t('nav.myListings')}
                    </Link>
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link to={`/${currentLang}/admin/listings`} className="cursor-pointer">
                      <Shield className="mr-2 h-4 w-4" />
                      {t('nav.admin')}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} variant="destructive" className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
