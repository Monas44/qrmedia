import type { ApiResponse } from '@shared/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const UNAUTHORIZED_EVENT = 'qr:unauthorized';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network_error', 'Sem conexão com o servidor.');
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // resposta sem JSON
  }

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!body) throw new ApiError(res.status, 'invalid_response', `Resposta inesperada do servidor (${res.status}).`);
  if (!body.ok) throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  return body.data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = Array.isArray(err.details)
      ? (err.details as { path?: string; message?: string }[]).map((d) => d.message).filter(Boolean).join(' ')
      : '';
    return details ? `${err.message} ${details}` : err.message;
  }
  return err instanceof Error ? err.message : 'Erro inesperado.';
}
