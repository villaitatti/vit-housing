import { Outlet, Link, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Users, Mail, UserPlus, ShieldCheck, Send, MapPin } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const baseNavItems = [
  { key: 'listings', icon: Building2, path: 'admin/listings' },
  { key: 'users', icon: Users, path: 'admin/users' },
  { key: 'invitations', icon: Mail, path: 'admin/invitations' },
  { key: 'inviteUser', icon: UserPlus, path: 'admin/invite-user' },
];

const itAdminNavItems = [
  { key: 'serviceAuth0', icon: ShieldCheck, path: 'admin/services/auth0' },
  { key: 'serviceSes', icon: Send, path: 'admin/services/ses' },
  { key: 'serviceGoogleMaps', icon: MapPin, path: 'admin/services/google_maps' },
];

function NavItem({ item, currentLang, isActive }: { item: typeof baseNavItems[number]; currentLang: string; isActive: boolean }) {
  const { t } = useTranslation();
  const Icon = item.icon;

  return (
    <Link
      to={`/${currentLang}/${item.path}`}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {t(`admin.${item.key}`)}
    </Link>
  );
}

export function AdminLayout() {
  const { lang } = useParams();
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuth();
  const currentLang = lang || 'en';

  const isItAdmin = user?.roles.includes('HOUSE_IT_ADMIN');

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">{t('admin.title')}</h1>
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-56 shrink-0 rounded-lg border bg-muted/35 p-2">
          <nav className="flex md:flex-col gap-1">
            {baseNavItems.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                currentLang={currentLang}
                isActive={location.pathname === `/${currentLang}/${item.path}`}
              />
            ))}
            {isItAdmin && (
              <>
                <Separator className="my-2" />
                {itAdminNavItems.map((item) => (
                  <NavItem
                    key={item.key}
                    item={item}
                    currentLang={currentLang}
                    isActive={location.pathname === `/${currentLang}/${item.path}`}
                  />
                ))}
              </>
            )}
          </nav>
        </aside>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
