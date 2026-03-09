import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Trash2, Pencil, ArrowUpDown, ArrowUp, ArrowDown, Search, SearchX, Filter, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { PaginatedData, Role } from '@vithousing/shared';
import { ALL_ROLES } from '@vithousing/shared';

interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  roles: Role[];
  preferred_language: 'EN' | 'IT';
  created_at: string;
  last_login: string | null;
  _count: { listings: number };
}

type SortBy = 'first_name' | 'email' | 'created_at' | 'last_login';

const ROLE_LABELS: Record<Role, string> = {
  HOUSE_USER: 'roleUser',
  HOUSE_LANDLORD: 'roleLandlord',
  HOUSE_ADMIN: 'roleAdmin',
  HOUSE_IT_ADMIN: 'roleItAdmin',
};

const ROLE_VARIANTS: Record<Role, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  HOUSE_USER: 'outline',
  HOUSE_LANDLORD: 'secondary',
  HOUSE_ADMIN: 'default',
  HOUSE_IT_ADMIN: 'destructive',
};

export function AdminUsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRoles, setFilterRoles] = useState<Role[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Debounce search
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const filters = { search: debouncedSearch, roles: filterRoles.join(','), sortBy, sortOrder, page, limit };

  const { data, isLoading, isFetching } = useQuery<PaginatedData<AdminUser>>({
    queryKey: queryKeys.users.list(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = { sortBy, sortOrder, page, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterRoles.length > 0) params.roles = filterRoles.join(',');
      const res = await api.get('/api/v1/users', { params });
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  // Clamp page when totalPages shrinks (e.g., after search/filter)
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const updateRolesMutation = useMutation({
    mutationFn: async ({ id, roles }: { id: number; roles: Role[] }) => {
      await api.patch(`/api/v1/users/${id}`, { roles });
    },
    onMutate: async ({ id, roles: newRoles }) => {
      const queryKey = queryKeys.users.list(filters);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PaginatedData<AdminUser>>(queryKey);
      if (previous) {
        queryClient.setQueryData<PaginatedData<AdminUser>>(queryKey, {
          ...previous,
          items: previous.items.map(u => u.id === id ? { ...u, roles: newRoles } : u),
        });
      }
      return { previous, queryKey };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success(t('admin.rolesUpdated'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success(t('common.delete'));
      setDeleteUser(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const toggleFilterRole = (role: Role) => {
    setFilterRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
    setPage(1);
  };

  const toggleUserRole = (user: AdminUser, role: Role) => {
    const newRoles = user.roles.includes(role)
      ? user.roles.filter(r => r !== role)
      : [...user.roles, role];
    if (newRoles.length === 0) return; // must have at least 1 role
    updateRolesMutation.mutate({ id: user.id, roles: newRoles });
  };

  const SortIcon = ({ column }: { column: SortBy }) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const totalPages = data?.totalPages ?? 1;

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{t('admin.users')}</h2>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative w-full max-w-xl">
          <Loader2 className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin ${isFetching ? '' : 'hidden'}`} />
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isFetching ? 'hidden' : ''}`} />
          <Input
            placeholder={t('admin.searchPlaceholder')}
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              {t('admin.filterByRole')}
              {filterRoles.length > 0 && (
                <Badge variant="secondary" className="ml-1">{filterRoles.length}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              {ALL_ROLES.map(role => (
                <label key={role} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={filterRoles.includes(role)}
                    onCheckedChange={() => toggleFilterRole(role)}
                  />
                  <span className="text-sm">{t(`admin.${ROLE_LABELS[role]}`)}</span>
                </label>
              ))}
              {filterRoles.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => { setFilterRoles([]); setPage(1); }}
                >
                  {t('admin.allRoles')}
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
        {(debouncedSearch || filterRoles.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => { setSearch(''); setDebouncedSearch(''); setFilterRoles([]); setPage(1); }}
          >
            <X className="h-3.5 w-3.5" />
            {t('admin.clearAllFilters')}
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <button className="flex items-center font-medium" onClick={() => handleSort('first_name')}>
                {t('admin.userColumns.name')}
                <SortIcon column="first_name" />
              </button>
            </TableHead>
            <TableHead>
              <button className="flex items-center font-medium" onClick={() => handleSort('email')}>
                {t('admin.userColumns.email')}
                <SortIcon column="email" />
              </button>
            </TableHead>
            <TableHead>{t('admin.userColumns.role')}</TableHead>
            <TableHead>{t('admin.listingsCount')}</TableHead>
            <TableHead>{t('admin.userColumns.language')}</TableHead>
            <TableHead>
              <button className="flex items-center font-medium" onClick={() => handleSort('last_login')}>
                {t('admin.userColumns.lastLogin')}
                <SortIcon column="last_login" />
              </button>
            </TableHead>
            <TableHead>
              <button className="flex items-center font-medium" onClick={() => handleSort('created_at')}>
                {t('admin.userColumns.createdAt')}
                <SortIcon column="created_at" />
              </button>
            </TableHead>
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex flex-wrap gap-1 items-center cursor-pointer">
                      {user.roles.map(role => (
                        <Badge key={role} variant={ROLE_VARIANTS[role]}>
                          {t(`admin.${ROLE_LABELS[role]}`)}
                        </Badge>
                      ))}
                      <Pencil className="h-3 w-3 text-muted-foreground ml-1" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52" align="start">
                    <div className="space-y-2">
                      {ALL_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={user.roles.includes(role)}
                            onCheckedChange={() => toggleUserRole(user, role)}
                            disabled={user.roles.length === 1 && user.roles.includes(role)}
                          />
                          <span className="text-sm">{t(`admin.${ROLE_LABELS[role]}`)}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </TableCell>
              <TableCell>
                {user._count.listings > 0 ? (
                  <Badge variant="outline">{user._count.listings}</Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{user.preferred_language}</Badge>
              </TableCell>
              <TableCell>
                {user.last_login ? new Date(user.last_login).toLocaleString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit', hour12: true
                }) : '—'}
              </TableCell>
              <TableCell>{new Date(user.created_at).toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true
              })}</TableCell>
              <TableCell>
                {user.id !== currentUser?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteUser(user)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Empty state when filters yield no results */}
      {!isLoading && data?.items?.length === 0 && (debouncedSearch || filterRoles.length > 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <SearchX className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t('admin.noFilterResults')}</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">{t('admin.noFilterResultsDescription')}</p>
          <Button
            variant="outline"
            onClick={() => { setSearch(''); setDebouncedSearch(''); setFilterRoles([]); setPage(1); }}
          >
            {t('admin.clearAllFilters')}
          </Button>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {t('common.search')}: {data?.total ?? 0}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              aria-label={t('common.back')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              aria-label={t('common.next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={deleteUser !== null} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.deleteUserTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.deleteUserMessage', { name: deleteUser ? `${deleteUser.first_name} ${deleteUser.last_name}` : '' })}
              {deleteUser && deleteUser._count.listings > 0 && (
                <>
                  {' '}
                  {t('admin.deleteUserWithListings', { count: deleteUser._count.listings })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
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
