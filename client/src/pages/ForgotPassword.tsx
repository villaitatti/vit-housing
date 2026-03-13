import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@vithousing/shared';
import loginHeroImage from '@/assets/auth/20221104_133003.jpg';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const currentLang = lang === 'it' ? 'it' : 'en';
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: async (data: ForgotPasswordInput) => {
      await api.post('/api/v1/auth/forgot-password', data);
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });

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
                {t('auth.forgotPasswordTitle')}
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                {t('auth.forgotPasswordSubtitle')}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0">
              {submitted ? (
                <div className="space-y-5">
                  <p className="text-sm leading-6 text-[color:var(--brand-anthracite)]">
                    {t('auth.forgotPasswordSuccess')}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t('auth.forgotPasswordVitIdHint')}
                  </p>
                  <Link
                    to={`/${currentLang}/login`}
                    className="inline-block text-sm font-medium text-[color:var(--brand-anthracite)] underline underline-offset-4 transition-colors hover:text-[color:var(--brand-anthracite)]/80"
                  >
                    {t('auth.backToLogin')}
                  </Link>
                </div>
              ) : (
                <>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-5">
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
                                className="h-12 rounded-xl border-[color:var(--brand-grey-medium)] bg-white px-4 shadow-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-[13px]" />
                          </FormItem>
                        )}
                      />

                      {mutation.isError && (
                        <p className="text-sm text-destructive">{mutation.error.message}</p>
                      )}

                      <Button
                        type="submit"
                        className="h-12 w-full rounded-xl bg-[color:var(--brand-anthracite)] text-base font-semibold text-white shadow-sm hover:bg-[color:var(--brand-anthracite)]/90"
                        disabled={mutation.isPending}
                      >
                        {mutation.isPending ? t('common.loading') : t('auth.forgotPasswordButton')}
                      </Button>
                    </form>
                  </Form>

                  <div className="mt-6 space-y-4">
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t('auth.forgotPasswordVitIdHint')}
                    </p>
                    <Link
                      to={`/${currentLang}/login`}
                      className="inline-block text-sm font-medium text-[color:var(--brand-anthracite)] underline underline-offset-4 transition-colors hover:text-[color:var(--brand-anthracite)]/80"
                    >
                      {t('auth.backToLogin')}
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
