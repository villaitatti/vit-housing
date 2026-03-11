import axios from 'axios';

export class ApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = 'ApiError';
    this.code = options?.code;
    this.status = options?.status;
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => {
    // Unwrap the API envelope
    if (response.data?.success) {
      return { ...response, data: response.data.data };
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Get current language from URL
      const lang = window.location.pathname.split('/')[1] || 'en';
      // Don't redirect if already on login/register page to avoid infinite loop
      const path = window.location.pathname;
      if (!path.includes('/login') && !path.includes('/register')) {
        window.location.href = `/${lang}/login`;
      }
    }
    // Extract error message from envelope
    const message = error.response?.data?.error || error.message;
    return Promise.reject(
      new ApiError(message, {
        code: error.response?.data?.code,
        status: error.response?.status,
      }),
    );
  },
);

export default api;
