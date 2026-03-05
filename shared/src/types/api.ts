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

export interface JwtPayload {
  userId: number;
  email: string;
  role: 'HOUSE_USER' | 'HOUSE_LANDLORD' | 'HOUSE_ADMIN' | 'HOUSE_IT_ADMIN';
  preferred_language: 'EN' | 'IT';
}
