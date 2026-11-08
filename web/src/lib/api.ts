import type { ApiErrorBody, FieldErrors } from '@frame/shared';

/** Erro de API com as mensagens por campo (validação 422) */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: FieldErrors = {},
    public code?: string,
  ) {
    super(message);
  }
}

/** Eventos globais disparados pela camada de API (ouvidos pelo AuthContext) */
export const AUTH_EXPIRED = 'auth:expired';
export const AUTH_MUST_CHANGE_PASSWORD = 'auth:trocar-senha';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data as ApiErrorBody | null;
    // Sessão expirada fora das rotas de login: avisa o app para voltar à tela de entrada
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event(AUTH_EXPIRED));
    if (err?.code === 'TROCAR_SENHA') window.dispatchEvent(new Event(AUTH_MUST_CHANGE_PASSWORD));
    throw new ApiError(err?.error || `Erro ${res.status}`, res.status, err?.errors, err?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = null>(url: string) => request<T>('DELETE', url),
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
