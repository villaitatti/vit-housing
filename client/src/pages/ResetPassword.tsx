import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@vithousing/shared';
import api, { ApiError } from '@/lib/api';
import { getPasswordChecklist, getPasswordStrength, type PasswordStrength } from '@/lib/password';
import loginHeroImage from '@/assets/auth/20221104_133003.jpg';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

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

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlToken = searchParams.get('token')?.trim() || '';
  const [resetToken, setResetToken] = useState(urlToken);
  const [resetComplete, setResetComplete] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!urlToken || urlToken === resetToken) return;
    setResetToken(urlToken);
    setTokenError(null);
    setResetComplete(false);
  }, [resetToken, urlToken]);

  useEffect(() => {
    if (!urlToken) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('token');
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, urlToken]);

  useEffect(() => {
    if (!resetComplete) return undefined;
    const timeoutId = window.setTimeout(() => {
      navigate(`/${currentLang}/login`);
    }, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [currentLang, navigate, resetComplete]);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: '',
      password: '',
      password_confirm: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: ResetPasswordInput) => {
      await api.post('/api/v1/auth/reset-password', data);
    },
    onMutate: () => setTokenError(null),
    onSuccess: () => setResetComplete(true),
    onError: (err: Error) => {
      if (err instanceof ApiError && err.code === 'INVALID_TOKEN') {
        setTokenError('INVALID_TOKEN');
        return;
      }
      setTokenError('UNKNOWN');
    },
  });

  const password = form.watch('password');
  const passwordConfirm = form.watch('password_confirm');
  const checklist = getPasswordChecklist(password, passwordConfirm);
  const strengthPresentation = getStrengthPresentation(getPasswordStrength(password));

  if (!resetToken) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.resetPasswordTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-destructive">{t('auth.resetTokenInvalid')}</p>
            <Link
              to={`/${currentLang}/login`}
              className="inline-block text-sm font-medium underline underline-offset-4"
            >
              {t('auth.backToLogin')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.resetPasswordTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-destructive">
              {tokenError === 'INVALID_TOKEN' ? t('auth.resetTokenInvalid') : t('errors.serverError')}
            </p>
            <Link
              to={`/${currentLang}/forgot-password`}
              className="inline-block text-sm font-medium underline underline-offset-4"
            >
              {t('auth.forgotPasswordTitle')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('auth.resetPasswordCompleteTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p>{t('auth.resetPasswordSuccess')}</p>
            <p className="text-sm text-muted-foreground">{t('auth.redirectingToLogin')}</p>
            <Button className="w-full" onClick={() => navigate(`/${currentLang}/login`)}>
              {t('auth.loginButton')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--brand-grey-light)] text-foreground">
      <div className="relative grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
        <LanguageSwitch
          buttonClassName="rounded-full border border-[color:var(--brand-grey-medium)] bg-white/90 px-4 text-[color:var(--brand-anthracite)] shadow-sm backdrop-blur-sm hover:bg-white"
          className="absolute top-4 right-4 z-10"
        />
        <motion.div
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="relative min-h-[240px] overflow-hidden sm:min-h-[320px] lg:min-h-full"
        >
          <img
            src={loginHeroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.14, ease: 'easeOut' }}
          className="flex w-full items-center justify-center bg-white px-6 py-10 sm:px-10 lg:px-16"
        >
          <Card className="w-full max-w-[460px] gap-0 border-none bg-transparent py-0 shadow-none">
            <CardHeader className="space-y-3 px-0 pb-8">
              <CardTitle className="text-3xl font-semibold tracking-tight text-[color:var(--brand-anthracite)] sm:text-[2.5rem]">
                {t('auth.resetPasswordTitle')}
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {t('auth.resetPasswordSubtitle')}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => mutation.mutate({ ...data, token: resetToken }))}
                  className="space-y-5"
                >
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="gap-2.5">
                        <FormLabel className="text-sm font-medium text-[color:var(--brand-anthracite)]">
                          {t('auth.password')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border-[color:var(--brand-grey-medium)] bg-white px-4 shadow-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-[13px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password_confirm"
                    render={({ field }) => (
                      <FormItem className="gap-2.5">
                        <FormLabel className="text-sm font-medium text-[color:var(--brand-anthracite)]">
                          {t('auth.confirmPassword')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            className="h-12 rounded-xl border-[color:var(--brand-grey-medium)] bg-white px-4 shadow-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-[13px]" />
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
                      {checklist.map((item) => {
                        const requirementText = t(`auth.passwordChecklist.${item.id}`, {
                          min: PASSWORD_MIN_LENGTH,
                          max: PASSWORD_MAX_LENGTH,
                        });
                        const statusText = t(item.passed ? 'common.met' : 'common.notMet');

                        return (
                          <li
                            key={item.id}
                            className={item.passed ? 'text-emerald-700' : 'text-muted-foreground'}
                            aria-label={`${requirementText}. ${statusText}`}
                          >
                            <span aria-hidden="true">{item.passed ? '\u2713' : '\u2022'}</span>{' '}
                            {requirementText}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl bg-[color:var(--brand-anthracite)] text-base font-semibold text-white shadow-sm hover:bg-[color:var(--brand-anthracite)]/90"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? t('common.loading') : t('auth.resetPasswordButton')}
                  </Button>
                </form>
              </Form>

              <div className="mt-6">
                <Link
                  to={`/${currentLang}/login`}
                  className="inline-block text-sm font-medium text-[color:var(--brand-anthracite)] underline underline-offset-4 transition-colors hover:text-[color:var(--brand-anthracite)]/80"
                >
                  {t('auth.backToLogin')}
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
