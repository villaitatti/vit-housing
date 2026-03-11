import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerSchema,
  type RegisterInput,
} from '@vithousing/shared';
import api, { ApiError } from '@/lib/api';
import { getPasswordChecklist, getPasswordStrength, type PasswordStrength } from '@/lib/password';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface InvitationValidationResponse {
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: 'HOUSE_USER' | 'HOUSE_LANDLORD';
  language: 'EN' | 'IT';
  expires_at: string;
  status: 'pending';
}

function getInvitationErrorKey(code?: string): string {
  switch (code) {
    case 'TOKEN_USED':
      return 'auth.tokenUsed';
    case 'TOKEN_EXPIRED':
      return 'auth.tokenExpired';
    case 'TOKEN_REVOKED':
      return 'auth.tokenRevoked';
    case 'TOKEN_UNAVAILABLE':
      return 'auth.tokenUnavailable';
    default:
      return 'auth.invalidToken';
  }
}

function getStrengthPresentation(
  strength: PasswordStrength,
): { labelKey: string; barClassName: string; value: number } {
  switch (strength) {
    case 'strong':
      return {
        labelKey: 'auth.passwordStrengthStrong',
        barClassName: 'w-full bg-emerald-600',
        value: 100,
      };
    case 'good':
      return {
        labelKey: 'auth.passwordStrengthGood',
        barClassName: 'w-3/4 bg-sky-600',
        value: 75,
      };
    case 'fair':
      return {
        labelKey: 'auth.passwordStrengthFair',
        barClassName: 'w-1/2 bg-amber-500',
        value: 50,
      };
    default:
      return {
        labelKey: 'auth.passwordStrengthWeak',
        barClassName: 'w-1/4 bg-rose-600',
        value: 25,
      };
  }
}

export function RegisterPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inviteToken] = useState(() => searchParams.get('token')?.trim() || '');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [submissionErrorCode, setSubmissionErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!searchParams.has('token')) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('token');
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const {
    data: invitation,
    isLoading,
    isError,
    error,
  } = useQuery<InvitationValidationResponse>({
    queryKey: queryKeys.invitations.validate(inviteToken),
    queryFn: async () => {
      const res = await api.get(`/api/v1/invitations/validate/${inviteToken}`);
      return res.data;
    },
    enabled: !!inviteToken,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      password: '',
      password_confirm: '',
      preferred_language: 'EN',
      phone_number: '',
      mobile_number: '',
    },
  });

  useEffect(() => {
    if (!invitation) {
      return;
    }

    form.reset({
      first_name: invitation.first_name ?? '',
      last_name: invitation.last_name ?? '',
      password: '',
      password_confirm: '',
      preferred_language: invitation.language,
      phone_number: '',
      mobile_number: '',
    });
  }, [form, invitation, inviteToken]);

  useEffect(() => {
    if (!registrationComplete) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      navigate(`/${lang || 'en'}/login`);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [lang, navigate, registrationComplete]);

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterInput) => {
      await api.post('/api/v1/auth/register', data);
    },
    onMutate: () => {
      setSubmissionErrorCode(null);
    },
    onSuccess: () => {
      toast.success(t('auth.registrationSuccess'));
      setRegistrationComplete(true);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'INVALID_TOKEN':
          case 'TOKEN_USED':
          case 'TOKEN_EXPIRED':
          case 'TOKEN_REVOKED':
          case 'TOKEN_UNAVAILABLE':
            setSubmissionErrorCode(err.code);
            return;
          default:
            break;
        }
      }

      toast.error(err.message);
    },
  });

  const password = form.watch('password');
  const passwordConfirm = form.watch('password_confirm');
  const checklist = getPasswordChecklist(password, passwordConfirm);
  const strengthPresentation = getStrengthPresentation(getPasswordStrength(password));

  if (!inviteToken) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">{t('auth.invalidToken')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md space-y-4 p-8">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    const errorCode = error instanceof ApiError ? error.code : undefined;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.invitationStatusTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-8 text-center">
            <p className="text-destructive">{t(getInvitationErrorKey(errorCode))}</p>
            <p className="text-sm text-muted-foreground">{t('auth.invitationContactAdmin')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submissionErrorCode) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.invitationStatusTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-8 text-center">
            <p className="text-destructive">{t(getInvitationErrorKey(submissionErrorCode))}</p>
            <p className="text-sm text-muted-foreground">{t('auth.invitationContactAdmin')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (registrationComplete) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.registrationCompleteTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p>{t('auth.registrationSuccess')}</p>
            <p className="text-sm text-muted-foreground">{t('auth.redirectingToLogin')}</p>
            <Button className="w-full" onClick={() => navigate(`/${lang || 'en'}/login`)}>
              {t('auth.loginButton')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  const isLandlord = invitation.role === 'HOUSE_LANDLORD';

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xl"
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.registerTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => registerMutation.mutate({ ...data, token: inviteToken }))}
                className="space-y-5"
              >
                <div>
                  <label className="text-sm font-medium">{t('auth.email')}</label>
                  <Input value={invitation.email} disabled className="mt-1.5 bg-muted" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.firstName')}</FormLabel>
                        <FormControl>
                          <Input autoComplete="given-name" {...field} />
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
                          <Input autoComplete="family-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.password')}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password_confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.confirmPassword')}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{t('auth.passwordStrength')}</p>
                    <p
                      className="text-sm text-muted-foreground"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {t(strengthPresentation.labelKey)}
                    </p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full transition-all ${strengthPresentation.barClassName}`}
                      role="progressbar"
                      aria-label={t('auth.passwordStrength')}
                      aria-valuenow={strengthPresentation.value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {checklist.map((item) => (
                      <li
                        key={item.id}
                        className={item.passed ? 'text-emerald-700' : 'text-muted-foreground'}
                      >
                        <span aria-hidden="true">{item.passed ? '✓' : '•'}</span>{' '}
                        {t(`auth.passwordChecklist.${item.id}`, {
                          min: PASSWORD_MIN_LENGTH,
                          max: PASSWORD_MAX_LENGTH,
                        })}
                      </li>
                    ))}
                  </ul>
                </div>

                <FormField
                  control={form.control}
                  name="preferred_language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.preferredLanguage')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="EN">English</SelectItem>
                          <SelectItem value="IT">Italiano</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isLandlord && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.phoneNumber')}</FormLabel>
                          <FormControl>
                            <Input autoComplete="tel" {...field} />
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
                            <Input autoComplete="tel-national" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? t('common.loading') : t('auth.registerButton')}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
