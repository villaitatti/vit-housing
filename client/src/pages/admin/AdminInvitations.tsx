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
  role: 'HOUSE_USER' | 'HOUSE_LANDLORD';
  language: 'EN' | 'IT';
  used: boolean;
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
            <TableHead>{t('admin.userColumns.email')}</TableHead>
            <TableHead>{t('admin.userColumns.role')}</TableHead>
            <TableHead>{t('admin.userColumns.language')}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>{t('admin.userColumns.createdAt')}</TableHead>
            <TableHead>Invited By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.invitations?.map((inv) => {
            const isExpired = new Date(inv.expires_at) < new Date();
            const status = inv.used ? 'Used' : isExpired ? 'Expired' : 'Pending';
            const statusVariant = inv.used
              ? ('secondary' as const)
              : isExpired
                ? ('destructive' as const)
                : ('default' as const);

            return (
              <TableRow key={inv.id}>
                <TableCell>{inv.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {inv.role === 'HOUSE_LANDLORD' ? t('admin.roleLandlord') : t('admin.roleUser')}
                  </Badge>
                </TableCell>
                <TableCell>{inv.language}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant}>{status}</Badge>
                </TableCell>
                <TableCell>{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  {inv.inviter?.first_name} {inv.inviter?.last_name}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
