import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Role } from '@vithousing/shared';
import api from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  roles: Role[];
  preferred_language: 'EN' | 'IT';
  phone_number?: string | null;
  mobile_number?: string | null;
  auth0_user_id?: string | null;
  profile_photo_url?: string | null;
  has_uploaded_profile_photo?: boolean;
  avatar_url?: string | null;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { lang } = useParams();

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery<User>({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      const res = await api.get('/api/v1/users/me');
      return res.data.user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await api.post('/api/v1/auth/login', credentials);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/auth/logout');
    },
    onSuccess: () => {
      queryClient.clear();
      navigate(`/${lang || 'en'}/login`);
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !isError,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}
