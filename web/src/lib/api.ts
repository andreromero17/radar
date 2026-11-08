import type { ApiErrorBody, FieldErrors } from '@frame/shared';

/** Erro de API com as mensagens por campo (validação 422) */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: FieldErrors = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as ApiErrorBody | null;
    throw new ApiError(err?.error || `Erro ${res.status}`, res.status, err?.errors);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = null>(url: string) => request<T>('DELETE', url),
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
