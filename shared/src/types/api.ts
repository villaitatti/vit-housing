export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedDataWithStats<T, TStats> extends PaginatedData<T> {
  stats: TStats;
}

import type { Role } from '../constants/roles';

export interface JwtPayload {
  userId: number;
  email: string;
  roles: Role[];
  preferred_language: 'EN' | 'IT';
  token_version?: number;
}
