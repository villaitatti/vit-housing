import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginatedDataWithStats, Role, UpdateUserInput } from '@vithousing/shared';
import { updateUserSchema } from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { AdminManagedListingCard } from '@/components/admin/AdminManagedListingCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getInitials } from '@/lib/avatar';
import { toast } from 'sonner';

const adminUserDetailSchema = updateUserSchema.pick({
  first_name: true,
  last_name: true,
  phone_number: true,
  mobile_number: true,
});

type AdminUserDetailFormValues = z.infer<typeof adminUserDetailSchema>;

interface AdminUserDetail {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  roles: Role[];
  preferred_language: 'EN' | 'IT';
  phone_number?: string | null;
  mobile_number?: string | null;
  created_at: string;
  last_login: string | null;
  has_uploaded_profile_photo?: boolean;
  avatar_url?: string | null;
  _count: {
    listings: number;
  };
}

interface AdminListing {
  id: number;
  slug: string;
  title: string;
  address_1: string;
  city: string;
  province: string;
  monthly_rent: number | string;
  bedrooms: number;
  bathrooms: number;
  published: boolean;
  photos?: { url: string }[];
}

interface AdminListingsStats {
  totalListings: number;
}

type AdminListingsResponse = PaginatedDataWithStats<AdminListing, AdminListingsStats>;

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

function formatDateTime(value: string | null, locale: string) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AdminUserDetailPage() {
  const { t, i18n } = useTranslation();
  const { lang, id } = useParams();
  const currentLang = lang || 'en';
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 6;
  const userId = Number(id);
  const isValidUserId = Number.isInteger(userId) && userId > 0;

  const form = useForm<AdminUserDetailFormValues>({
    resolver: zodResolver(adminUserDetailSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      phone_number: '',
      mobile_number: '',
    },
  });

  const userQuery = useQuery<{ user: AdminUserDetail }>({
    queryKey: queryKeys.users.detail(userId),
    queryFn: async () => {
      const res = await api.get(`/api/v1/users/${userId}`);
      return res.data;
    },
    enabled: isValidUserId,
  });

  const listingsQuery = useQuery<AdminListingsResponse>({
    queryKey: queryKeys.listings.admin({ ownerId: userId, page, limit }),
    queryFn: async () => {
      const res = await api.get('/api/v1/admin/listings', {
        params: {
          ownerId: userId,
          page,
          limit,
        },
      });
      return res.data;
    },
    enabled: isValidUserId,
    placeholderData: keepPreviousData,
  });

  const user = userQuery.data?.user;

  useEffect(() => {
    if (!user) {
      return;
    }

    form.reset({
      first_name: user.first_name,
      last_name: user.last_name,
      phone_number: user.phone_number || '',
      mobile_number: user.mobile_number || '',
    });
  }, [form, user]);

  const updateMutation = useMutation({
    mutationFn: async (values: AdminUserDetailFormValues) => {
      await api.patch(`/api/v1/users/${userId}`, values satisfies Partial<UpdateUserInput>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      toast.success(t('profile.updateSuccess'));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const listingsCount = listingsQuery.data?.total ?? user?._count.listings ?? 0;
  const totalPages = listingsQuery.data?.totalPages ?? 1;
  const userFullName = useMemo(() => {
    if (!user) {
      return '';
    }
    return `${user.first_name} ${user.last_name}`.trim();
  }, [user]);

  if (!isValidUserId) {
    return (
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardContent className="py-10 text-center text-destructive">
          {t('common.error')}
        </CardContent>
      </Card>
    );
  }

  if (userQuery.isLoading) {
    return (
      <div className="space-y-6 pb-6">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (userQuery.isError || !user) {
    return (
      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardContent className="py-10 text-center text-destructive">
          {(userQuery.error as Error | null)?.message || t('common.error')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link to={`/${currentLang}/admin/users`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('admin.backToUsers')}
        </Link>
      </Button>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-24 w-24 border border-border/60 bg-muted">
              {user.avatar_url ? (
                <AvatarImage src={user.avatar_url} alt={userFullName} />
              ) : null}
              <AvatarFallback className="text-xl">
                {getInitials(user.first_name, user.last_name)}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-2">
              <div>
                <CardTitle className="text-2xl">{userFullName}</CardTitle>
                <CardDescription>{t('admin.userDetailsDescription')}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <Badge key={role} variant={ROLE_VARIANTS[role]}>
                    {t(`admin.${ROLE_LABELS[role]}`)}
                  </Badge>
                ))}
                <Badge variant="outline">{user.preferred_language}</Badge>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t('auth.email')}</p>
              <p className="break-all text-sm">{user.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t('admin.userColumns.createdAt')}</p>
              <p className="text-sm">{formatDateTime(user.created_at, i18n.language)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t('admin.userColumns.lastLogin')}</p>
              <p className="text-sm">{formatDateTime(user.last_login, i18n.language)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t('admin.listingsCount')}</p>
              <p className="text-sm">{user._count.listings}</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))} className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.firstName')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.lastName')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.phoneNumber')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mobile_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.mobileNumber')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="md:col-span-2">
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t('common.loading') : t('common.save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.userListingsTitle', { name: userFullName, count: listingsCount })}</CardTitle>
            <CardDescription>{t('admin.userListingsDescription')}</CardDescription>
          </div>
          <Badge variant="secondary" className="self-start sm:self-center">
            {listingsCount}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          {listingsQuery.isLoading && !listingsQuery.data ? (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : listingsQuery.isError ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div>
                <p className="font-medium text-destructive">
                  {listingsQuery.error instanceof Error ? listingsQuery.error.message : t('common.error')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t('admin.retryUserListingsFetch')}</p>
              </div>
              <Button variant="outline" onClick={() => listingsQuery.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : listingsQuery.data?.items?.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {listingsQuery.data.items.map((listing) => (
                <AdminManagedListingCard
                  key={listing.id}
                  listing={listing}
                  lang={currentLang}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              {t('admin.noUserListings')}
            </div>
          )}

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
    </div>
  );
}
