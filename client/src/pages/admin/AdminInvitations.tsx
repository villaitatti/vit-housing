import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminInvitation {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: 'HOUSE_USER' | 'HOUSE_LANDLORD';
  language: 'EN' | 'IT';
  used: boolean;
  revoked_at: string | null;
  created_at: string;
  expires_at: string;
  inviter?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface InvitationsResponse {
  invitations: AdminInvitation[];
}

export function AdminInvitationsPage() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<InvitationsResponse>({
    queryKey: queryKeys.invitations.all,
    queryFn: async () => {
      const res = await api.get('/api/v1/invitations');
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{t('admin.invitations')}</h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.userColumns.name')}</TableHead>
            <TableHead>{t('admin.userColumns.email')}</TableHead>
            <TableHead>{t('admin.userColumns.role')}</TableHead>
            <TableHead>{t('admin.userColumns.language')}</TableHead>
            <TableHead>{t('admin.invitationStatus')}</TableHead>
            <TableHead>{t('admin.userColumns.createdAt')}</TableHead>
            <TableHead>{t('admin.invitedBy')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.invitations?.map((inv) => {
            const isExpired = new Date(inv.expires_at) < new Date();
            const invitedName = [inv.first_name, inv.last_name].filter(Boolean).join(' ');
            const status = inv.revoked_at
              ? 'revoked'
              : inv.used
                ? 'used'
                : isExpired
                  ? 'expired'
                  : 'pending';
            const statusVariant = inv.used
              ? ('secondary' as const)
              : inv.revoked_at || isExpired
                ? ('destructive' as const)
                : ('default' as const);

            return (
              <TableRow key={inv.id}>
                <TableCell>{invitedName || '—'}</TableCell>
                <TableCell>{inv.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {inv.role === 'HOUSE_LANDLORD' ? t('admin.roleLandlord') : t('admin.roleUser')}
                  </Badge>
                </TableCell>
                <TableCell>{inv.language}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant}>{t(`admin.status.${status}`)}</Badge>
                </TableCell>
                <TableCell>{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {[inv.inviter?.first_name, inv.inviter?.last_name].filter(Boolean).join(' ') || '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
