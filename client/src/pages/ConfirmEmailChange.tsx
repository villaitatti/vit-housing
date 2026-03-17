import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api, { ApiError } from '@/lib/api';
import loginHeroImage from '@/assets/auth/20221104_133003.jpg';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SESSION_KEY = 'confirmEmailToken';

export function ConfirmEmailChangePage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlToken = searchParams.get('token')?.trim() || '';
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  // Persist token to sessionStorage so it survives URL stripping and re-renders
  const [token] = useState(() => {
    if (urlToken) {
      sessionStorage.setItem(SESSION_KEY, urlToken);
      return urlToken;
    }
    return sessionStorage.getItem(SESSION_KEY) || '';
  });

  // Strip token from URL for security
  useEffect(() => {
    if (!urlToken) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('token');
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, urlToken]);

  const mutation = useMutation({
    mutationFn: async (confirmToken: string) => {
      await api.post('/api/v1/auth/confirm-email-change', { token: confirmToken });
    },
    onSuccess: () => {
      sessionStorage.removeItem(SESSION_KEY);
      setConfirmed(true);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && (err.code === 'INVALID_TOKEN' || err.code === 'EMAIL_EXISTS')) {
        sessionStorage.removeItem(SESSION_KEY);
        setError(err.code);
        return;
      }
      setError('UNKNOWN');
    },
  });

  // Auto-submit token once on mount (guard against StrictMode / remount double-fire)
  useEffect(() => {
    if (token && !submittedRef.current) {
      submittedRef.current = true;
      mutation.mutate(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Redirect to login after confirmation
  useEffect(() => {
    if (!confirmed) return undefined;
    const timeoutId = window.setTimeout(() => {
      navigate(`/${currentLang}/login`);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [confirmed, currentLang, navigate]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('confirmEmailChange.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-destructive">{t('confirmEmailChange.invalidToken')}</p>
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

  if (error) {
    const errorMessage = error === 'EMAIL_EXISTS'
      ? t('confirmEmailChange.emailExists')
      : error === 'INVALID_TOKEN'
        ? t('confirmEmailChange.invalidToken')
        : t('errors.serverError');

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('confirmEmailChange.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-destructive">{errorMessage}</p>
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

  if (confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('confirmEmailChange.successTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p>{t('confirmEmailChange.successMessage')}</p>
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
                {t('confirmEmailChange.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
