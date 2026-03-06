import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth0 } from '@auth0/auth0-react';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema, type LoginInput } from '@vithousing/shared';
import loginHeroImage from '@/assets/auth/20221104_133003.jpg';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const REMEMBERED_EMAIL_STORAGE_KEY = 'vithousing.rememberedEmail';

export function LoginPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const navigate = useNavigate();
  const { login, loginError, isLoggingIn, isAuthenticated, isLoading } = useAuth();
  const { loginWithRedirect } = useAuth0();
  const initialRememberedEmail =
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY)?.trim() ?? '';
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(Boolean(initialRememberedEmail));

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: initialRememberedEmail, password: '' },
  });

  const onSubmit = async (data: LoginInput) => {
    try {
      await login(data);

      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, data.email);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
      }

      navigate(`/${currentLang}/home`);
    } catch {
      // Error is handled by useAuth
    }
  };

  const handleVitIdLogin = () => {
    loginWithRedirect({
      appState: { returnTo: `/${currentLang}/home` },
    });
  };

  if (!isLoading && isAuthenticated) {
    return <Navigate to={`/${currentLang}/home`} replace />;
  }

  return (
    <div className="min-h-screen bg-[#f3f0eb] text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
        <div className="relative min-h-[240px] overflow-hidden sm:min-h-[320px] lg:min-h-screen">
          <img
            src={loginHeroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex w-full items-center justify-center bg-[#fcfbf8] px-6 py-10 sm:px-10 lg:px-16"
        >
          <Card className="w-full max-w-[460px] gap-0 border-none bg-transparent py-0 shadow-none">
            <CardHeader className="space-y-3 px-0 pb-8">
              <CardTitle className="text-3xl font-semibold tracking-tight text-[color:var(--brand-anthracite)] sm:text-[2.5rem]">
                {t('auth.loginTitle')}
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {t('auth.loginSubtitle')}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="gap-2.5">
                        <FormLabel className="text-sm font-medium text-[color:var(--brand-anthracite)]">
                          {t('auth.email')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="name@example.com"
                            autoComplete="email"
                            className="h-12 rounded-xl border-[#c8d0d6] bg-white px-4 shadow-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-[13px]" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="gap-2.5">
                        <FormLabel className="text-sm font-medium text-[color:var(--brand-anthracite)]">
                          {t('auth.password')}
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              className="h-12 rounded-xl border-[#c8d0d6] bg-white px-4 pr-12 shadow-none"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((current) => !current)}
                              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition-colors hover:text-[color:var(--brand-anthracite)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                              aria-pressed={showPassword}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-[13px]" />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="remember-me"
                        checked={rememberEmail}
                        onCheckedChange={(checked) => setRememberEmail(checked === true)}
                      />
                      <Label htmlFor="remember-me" className="cursor-pointer text-sm font-medium text-[color:var(--brand-anthracite)]">
                        {t('auth.rememberMe')}
                      </Label>
                    </div>

                    <a
                      href={`/${currentLang}/forgot-password`}
                      onClick={(event) => event.preventDefault()}
                      className="text-sm font-medium text-muted-foreground transition-colors hover:text-[color:var(--brand-anthracite)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#fcfbf8]"
                    >
                      {t('auth.forgotPassword')}
                    </a>
                  </div>

                  {loginError && (
                    <p className="text-sm text-destructive">{loginError.message}</p>
                  )}

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl bg-[color:var(--brand-anthracite)] text-base font-semibold text-white shadow-sm hover:bg-[color:var(--brand-anthracite)]/90"
                    disabled={isLoggingIn}
                  >
                    {isLoggingIn ? t('common.loading') : t('auth.loginButton')}
                  </Button>
                </form>
              </Form>

              <div className="mt-8 space-y-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full bg-[#d6dde2]" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#fcfbf8] px-4 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {t('common.or')}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-center text-sm leading-6 text-muted-foreground">
                    {t('auth.vitIdHelper')}
                  </p>

                  <Button
                    variant="outline"
                    className="h-12 w-full rounded-xl border-[#c8d0d6] bg-white text-base font-semibold text-[color:var(--brand-anthracite)] shadow-none hover:bg-[#f7f9fa]"
                    onClick={handleVitIdLogin}
                  >
                    {t('auth.vitIdLogin')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
