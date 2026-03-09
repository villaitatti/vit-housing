import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vithousing/shared';

interface RoleGuardProps {
  roles: Role[];
  children: React.ReactNode;
}

export function RoleGuard({ roles, children }: RoleGuardProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user || !user.roles?.length || !roles.some(r => user.roles.includes(r))) {
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
