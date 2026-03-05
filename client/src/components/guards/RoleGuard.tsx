import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

type Role = 'HOUSE_USER' | 'HOUSE_LANDLORD' | 'HOUSE_ADMIN' | 'HOUSE_IT_ADMIN';

interface RoleGuardProps {
  roles: Role[];
  children: React.ReactNode;
}

export function RoleGuard({ roles, children }: RoleGuardProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user || !roles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">403</h2>
          <p className="text-muted-foreground">{t('errors.forbidden')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
