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
  if (typeof data === 'string' && data) return data.slice(0, 500);
  if (Array.isArray(data) && data.length) return JSON.stringify(data).slice(0, 500);
  const messages: string[] = [];
  if (data && typeof data === 'object' && 'error' in data) {
    const providerError = (data as { error?: { message?: unknown } | string }).error;
    if (typeof providerError === 'string' && providerError) messages.push(providerError);
    if (
      providerError &&
      typeof providerError === 'object' &&
      typeof providerError.message === 'string' &&
      providerError.message
    )
      messages.push(providerError.message);
  }
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message) messages.push(message);
  }
  if (data && typeof data === 'object' && 'errors' in data) {
    const errors = (data as { errors?: unknown }).errors;
    if (errors) messages.push(JSON.stringify(errors).slice(0, 500));
  }
  if (messages.length) return [...new Set(messages)].join(' | ');
  if (data && typeof data === 'object') {
    const serialized = JSON.stringify(data);
    if (serialized && serialized !== '{}') return serialized.slice(0, 500);
  }
  return error.message;
}
