import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { updateUserSchema, type UpdateUserInput } from '@vithousing/shared';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { ProfilePhotoDialog } from '@/components/profile/ProfilePhotoDialog';
import { getInitials } from '@/lib/avatar';
import { toast } from 'sonner';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const showPhoneFields = user?.roles?.some(r => ['HOUSE_LANDLORD', 'HOUSE_ADMIN'].includes(r));

  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      preferred_language: user?.preferred_language || 'EN',
      phone_number: user?.phone_number || '',
      mobile_number: user?.mobile_number || '',
    },
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    form.reset({
      first_name: user.first_name,
      last_name: user.last_name,
      preferred_language: user.preferred_language,
      phone_number: user.phone_number || '',
      mobile_number: user.mobile_number || '',
    });
  }, [form, user]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserInput) => {
      await api.patch('/api/v1/users/me', data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      if (variables.preferred_language) {
        i18n.changeLanguage(variables.preferred_language.toLowerCase());
      }
      toast.success(t('profile.updateSuccess'));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const formData = new FormData();
      formData.append('photo', new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' }));
      const res = await api.post('/api/v1/users/me/photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      setPendingFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast.success(t('profile.photo.updateSuccess'));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/api/v1/users/me/photo');
      return res.data.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      toast.success(t('profile.photo.removeSuccess'));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (!user) return null;

  return (
    <motion.div
      className="container mx-auto max-w-lg px-4 py-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('profile.photo.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-24 w-24 border border-border/60 bg-muted">
              {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} /> : null}
              <AvatarFallback className="text-xl">{getInitials(user.first_name, user.last_name)}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-medium">{t('profile.photo.help')}</p>
              <p className="text-sm text-muted-foreground">
                {user.has_uploaded_profile_photo
                  ? t('profile.photo.uploaded')
                  : user.auth0_user_id
                    ? t('profile.photo.gravatarFallback')
                    : t('profile.photo.noPhoto')}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0] ?? null;
                setPendingFile(selectedFile);
              }}
            />
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              {t('profile.photo.upload')}
            </Button>
            {user.has_uploaded_profile_photo ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => deletePhotoMutation.mutate()}
                disabled={deletePhotoMutation.isPending}
              >
                {deletePhotoMutation.isPending ? t('common.loading') : t('profile.photo.remove')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.personalInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('auth.email')}</label>
                <Input value={user.email} disabled className="mt-1.5 bg-muted" />
              </div>

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
                name="preferred_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.preferredLanguage')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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

              {showPhoneFields && (
                <>
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
                </>
              )}

              {/* TODO: Password reset can be added later via AWS SES reset token */}

              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <ProfilePhotoDialog
        open={Boolean(pendingFile)}
        file={pendingFile}
        isSubmitting={uploadPhotoMutation.isPending}
        onCancel={() => {
          setPendingFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        onConfirm={async (blob) => {
          await uploadPhotoMutation.mutateAsync(blob);
        }}
      />
    </motion.div>
  );
}
