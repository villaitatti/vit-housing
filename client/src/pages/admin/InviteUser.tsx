import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInvitationSchema, type CreateInvitationInput } from '@vithousing/shared';
import { z } from 'zod';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import { toast } from 'sonner';

type InviteUserFormValues = z.input<typeof createInvitationSchema>;

export function InviteUserPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const form = useForm<InviteUserFormValues, unknown, CreateInvitationInput>({
    resolver: zodResolver(createInvitationSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      role: 'HOUSE_USER',
      language: 'EN',
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: CreateInvitationInput) => {
      await api.post('/api/v1/invitations', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all });
      toast.success(t('admin.inviteSent'));
      form.reset({
        email: '',
        first_name: '',
        last_name: '',
        role: 'HOUSE_USER',
        language: 'EN',
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">{t('admin.inviteTitle')}</h2>

      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => inviteMutation.mutate(data))}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('admin.inviteFirstName')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin.inviteFirstNamePlaceholder')} {...field} />
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
                      <FormLabel>{t('admin.inviteLastName')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin.inviteLastNamePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.inviteEmail')}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.inviteRole')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="HOUSE_USER">{t('admin.roleUser')}</SelectItem>
                        <SelectItem value="HOUSE_LANDLORD">{t('admin.roleLandlord')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.inviteLanguage')}</FormLabel>
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

              <Button type="submit" className="w-full" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? t('common.loading') : t('admin.sendInvite')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
