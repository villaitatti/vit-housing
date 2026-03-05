import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import type { PaginatedData, Role } from '@vithousing/shared';

interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  preferred_language: 'EN' | 'IT';
  created_at: string;
  last_login: string | null;
}

export function AdminUsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<PaginatedData<AdminUser>>({
    queryKey: queryKeys.users.all,
    queryFn: async () => {
      const res = await api.get('/api/v1/users', { params: { limit: 100 } });
      return res.data;
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: Role }) => {
      await api.patch(`/api/v1/users/${id}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(t('common.save'));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(t('common.delete'));
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
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
      <h2 className="text-2xl font-semibold mb-6">{t('admin.users')}</h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.userColumns.name')}</TableHead>
            <TableHead>{t('admin.userColumns.email')}</TableHead>
            <TableHead>{t('admin.userColumns.role')}</TableHead>
            <TableHead>{t('admin.userColumns.language')}</TableHead>
            <TableHead>{t('admin.userColumns.lastLogin')}</TableHead>
            <TableHead>{t('admin.userColumns.createdAt')}</TableHead>
            <TableHead>{t('admin.userColumns.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items?.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                {user.first_name} {user.last_name}
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Select
                  defaultValue={user.role}
                  onValueChange={(role) =>
                    updateRoleMutation.mutate({ id: user.id, role: role as Role })
                  }
                >
                  <SelectTrigger className="w-40 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOUSE_USER">{t('admin.roleUser')}</SelectItem>
                    <SelectItem value="HOUSE_LANDLORD">{t('admin.roleLandlord')}</SelectItem>
                    <SelectItem value="HOUSE_ADMIN">{t('admin.roleAdmin')}</SelectItem>
                    <SelectItem value="HOUSE_IT_ADMIN">{t('admin.roleItAdmin')}</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{user.preferred_language}</Badge>
              </TableCell>
              <TableCell>
                {user.last_login ? new Date(user.last_login).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(user.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('admin.deleteConfirmMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
