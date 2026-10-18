import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { AppError } from './http';

/** Base das URLs curtas: PUBLIC_BASE_URL (domínio próprio) ou a origem atual. */
export function publicBaseUrl(c: Context<AppEnv>): string {
  const configured = c.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  return configured || new URL(c.req.url).origin;
}

/**
 * IP do visitante. Atrás do proxy do Railway o socket é o do proxy; o IP real
 * vem em X-Real-IP / X-Forwarded-For. Usado só para hash e rate limit — nunca gravado.
 */
export function clientIp(headers: Headers, remoteAddr?: string): string {
  const real = headers.get('X-Real-IP')?.trim();
  if (real) return real;
  const forwarded = headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  return forwarded || remoteAddr || 'unknown';
}

export function parseId(raw: string | undefined, what = 'id'): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError(400, 'invalid_id', `Parâmetro ${what} inválido.`);
  return id;
}

export const isTruthy = (v: string | undefined) => v === '1' || v === 'true';
