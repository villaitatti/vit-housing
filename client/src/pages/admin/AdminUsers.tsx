import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Filter, Loader2, Pencil, Search, SearchX, Trash2, X } from 'lucide-react';
import type { PaginatedDataWithStats, Role } from '@vithousing/shared';
import { ALL_ROLES } from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { AdminStatCard } from '@/components/admin/AdminStatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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
  updating?: boolean;
}

interface AdminUsersStats {
  totalUsers: number;
  totalHouseUsers: number;
  totalHouseLandlords: number;
}

type AdminUsersResponse = PaginatedDataWithStats<AdminUser, AdminUsersStats>;
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

function renderSortIcon(column: SortBy, sortBy: SortBy, sortOrder: 'asc' | 'desc') {
  if (sortBy !== column) {
    return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />;
  }

  return sortOrder === 'asc'
    ? <ArrowUp className="ml-1 h-3.5 w-3.5" />
    : <ArrowDown className="ml-1 h-3.5 w-3.5" />;
}

export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang || 'en';
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

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    cancelPendingSearch();
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, [cancelPendingSearch]);

  const filters = {
    search: debouncedSearch,
    roles: filterRoles.join(','),
    sortBy,
    sortOrder,
    page,
    limit,
  };

  const { data, isLoading, isFetching, error, isError, refetch } = useQuery<AdminUsersResponse>({
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

  const updateRolesMutation = useMutation({
    mutationFn: async ({ id, roles }: { id: number; roles: Role[] }) => {
      await api.patch(`/api/v1/users/${id}`, { roles });
    },
    onMutate: async ({ id, roles: newRoles }) => {
      const queryKey = queryKeys.users.list(filters);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AdminUsersResponse>(queryKey);

      if (previous) {
        queryClient.setQueryData<AdminUsersResponse>(queryKey, {
          ...previous,
          items: previous.items.map((user) => (
            user.id === id ? { ...user, roles: newRoles, updating: true } : user
          )),
        });
      }

      return { previous, queryKey, id };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      } else if (context?.queryKey) {
        queryClient.setQueryData<AdminUsersResponse | undefined>(context.queryKey, (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            items: current.items.map((user) => (
              user.id === context.id ? { ...user, updating: false } : user
            )),
          };
        });
      }
      toast.error(err.message);
    },
    onSuccess: () => {
      toast.success(t('admin.rolesUpdated'));
    },
    onSettled: (_data, _error, _vars, context) => {
      if (context?.queryKey) {
        queryClient.setQueryData<AdminUsersResponse | undefined>(context.queryKey, (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            items: current.items.map((user) => (
              user.id === context.id ? { ...user, updating: false } : user
            )),
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      toast.success(t('common.delete'));
      setDeleteUser(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const toggleFilterRole = (role: Role) => {
    setFilterRoles((prev) => (
      prev.includes(role) ? prev.filter((existingRole) => existingRole !== role) : [...prev, role]
    ));
    setPage(1);
  };

  const toggleUserRole = (user: AdminUser, role: Role) => {
    const newRoles = user.roles.includes(role)
      ? user.roles.filter((existingRole) => existingRole !== role)
      : [...user.roles, role];

    if (newRoles.length === 0) {
      return;
    }

    updateRolesMutation.mutate({ id: user.id, roles: newRoles });
  };

  const clearAllFilters = () => {
    cancelPendingSearch();
    setSearch('');
    setDebouncedSearch('');
    setFilterRoles([]);
    setPage(1);
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6 pb-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div>
            <p className="font-medium text-destructive">
              {error instanceof Error ? error.message : t('common.error')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('admin.retryUsersFetch')}</p>
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6 pb-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminStatCard
          label={t('admin.totalUsers')}
          value={data?.stats.totalUsers ?? 0}
          description={t('admin.totalUsersDescription')}
        />
        <AdminStatCard
          label={t('admin.totalRoleUsers')}
          value={data?.stats.totalHouseUsers ?? 0}
          description={t('admin.totalRoleUsersDescription')}
        />
        <AdminStatCard
          label={t('admin.totalRoleLandlords')}
          value={data?.stats.totalHouseLandlords ?? 0}
          description={t('admin.totalRoleLandlordsDescription')}
        />
      </div>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle>{t('admin.filtersTitle')}</CardTitle>
          <CardDescription>{t('admin.usersFiltersDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full max-w-xl">
              <Loader2 className={`absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground ${isFetching ? '' : 'hidden'}`} />
              <Search className={`absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground ${isFetching ? 'hidden' : ''}`} />
              <Input
                placeholder={t('admin.searchPlaceholder')}
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                className="pl-9 pr-9"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => {
                    cancelPendingSearch();
                    setSearch('');
                    setDebouncedSearch('');
                    setPage(1);
                  }}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={t('admin.clearSearch')}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  {t('admin.filterByRole')}
                  {filterRoles.length > 0 ? (
                    <Badge variant="secondary" className="ml-1">{filterRoles.length}</Badge>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-2">
                  {ALL_ROLES.map((role) => (
                    <label key={role} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={filterRoles.includes(role)}
                        onCheckedChange={() => toggleFilterRole(role)}
                      />
                      <span className="text-sm">{t(`admin.${ROLE_LABELS[role]}`)}</span>
                    </label>
                  ))}
                  {filterRoles.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => {
                        setFilterRoles([]);
                        setPage(1);
                      }}
                    >
                      {t('admin.allRoles')}
                    </Button>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>

            {(debouncedSearch || filterRoles.length > 0) ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3.5 w-3.5" />
                {t('admin.clearAllFilters')}
              </Button>
            ) : null}
          </div>

          <p className="text-sm text-muted-foreground">
            {t('admin.resultsCount', { count: data?.total ?? 0 })}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle>{t('admin.users')}</CardTitle>
          <CardDescription>{t('admin.usersTableDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button className="flex items-center font-medium" onClick={() => handleSort('first_name')}>
                      {t('admin.userColumns.name')}
                      {renderSortIcon('first_name', sortBy, sortOrder)}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center font-medium" onClick={() => handleSort('email')}>
                      {t('admin.userColumns.email')}
                      {renderSortIcon('email', sortBy, sortOrder)}
                    </button>
                  </TableHead>
                  <TableHead>{t('admin.userColumns.role')}</TableHead>
                  <TableHead>{t('admin.listingsCount')}</TableHead>
                  <TableHead>{t('admin.userColumns.language')}</TableHead>
                  <TableHead>
                    <button className="flex items-center font-medium" onClick={() => handleSort('last_login')}>
                      {t('admin.userColumns.lastLogin')}
                      {renderSortIcon('last_login', sortBy, sortOrder)}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center font-medium" onClick={() => handleSort('created_at')}>
                      {t('admin.userColumns.createdAt')}
                      {renderSortIcon('created_at', sortBy, sortOrder)}
                    </button>
                  </TableHead>
                  <TableHead>{t('admin.userColumns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link to={`/${currentLang}/admin/users/${user.id}`} className="font-medium text-primary hover:underline">
                        {user.first_name} {user.last_name}
                      </Link>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex cursor-pointer flex-wrap items-center gap-1">
                            {user.roles.map((role) => (
                              <Badge key={role} variant={ROLE_VARIANTS[role]}>
                                {t(`admin.${ROLE_LABELS[role]}`)}
                              </Badge>
                            ))}
                            <Pencil className="ml-1 h-3 w-3 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52" align="start">
                          <div className="space-y-2">
                            {ALL_ROLES.map((role) => (
                              <label key={role} className="flex cursor-pointer items-center gap-2">
                                <Checkbox
                                  checked={user.roles.includes(role)}
                                  onCheckedChange={() => toggleUserRole(user, role)}
                                  disabled={user.updating || (user.roles.length === 1 && user.roles.includes(role))}
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
                      {user.last_login ? new Date(user.last_login).toLocaleString(i18n.language, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      }) : '—'}
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleString(i18n.language, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      {currentUser && user.id !== currentUser.id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteUser(user)}
                          className="text-destructive hover:text-destructive"
                          aria-label={t('admin.deleteUser')}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!isLoading && data?.items?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">{t('admin.noFilterResults')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('admin.noFilterResultsDescription')}</p>
              {(debouncedSearch || filterRoles.length > 0) ? (
                <Button variant="outline" className="mt-4" onClick={clearAllFilters}>
                  {t('admin.clearAllFilters')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('admin.resultsPage', { page, totalPages })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
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
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  aria-label={t('pagination.nextPage', 'Next page')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={deleteUser !== null} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.deleteUserTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.deleteUserMessage', { name: deleteUser ? `${deleteUser.first_name} ${deleteUser.last_name}` : '' })}
              {deleteUser && deleteUser._count.listings > 0 ? (
                <>
                  {' '}
                  {t('admin.deleteUserWithListings', { count: deleteUser._count.listings })}
                </>
              ) : null}
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
