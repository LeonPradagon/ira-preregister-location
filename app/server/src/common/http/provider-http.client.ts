import axios, { AxiosError, AxiosInstance } from 'axios';

export const providerHttpClient: AxiosInstance = axios.create({
  headers: { accept: 'application/json' },
});

providerHttpClient.interceptors.request.use((config) => {
  config.headers.set('accept', 'application/json');
  return config;
});

providerHttpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      error.message = 'Provider request timed out';
    }
    return Promise.reject(error);
  },
);

export function providerErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : 'unknown error';
  const data = error.response?.data;
  if (data && typeof data === 'object' && 'error' in data) {
    const providerError = (data as { error?: { message?: unknown } }).error;
    if (typeof providerError?.message === 'string') return providerError.message;
  }
  return error.message;
}
