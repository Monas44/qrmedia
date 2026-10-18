import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { AppEnv, Env } from '../env';
import { safeEqual, sha256Hex } from '../lib/crypto';
import { AppError } from '../lib/http';
import { clientIp } from '../lib/request';
import { clearAttempts, getAttempts, registerFailure } from '../repositories/rate-limit-repo';

export const SESSION_COOKIE = 'qr_session';
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function assertConfigured(env: Env) {
  if (!env.ADMIN_PASSWORD || !env.JWT_SECRET || env.JWT_SECRET.length < 16) {
    throw new AppError(500, 'auth_not_configured', 'Configure os secrets ADMIN_PASSWORD e JWT_SECRET (mín. 16 caracteres).');
  }
}

const clientKey = (c: Context<AppEnv>) => sha256Hex(`login|${clientIp(c.req.raw.headers, c.env.REMOTE_ADDR)}`);

/** Valida a senha com rate limit por IP (hash) e grava o cookie de sessão. */
export async function login(c: Context<AppEnv>, password: string): Promise<void> {
  assertConfigured(c.env);
  const key = await clientKey(c);
  const now = Date.now();

  const attempts = await getAttempts(c.env.DB, key);
  if (attempts && attempts.count >= LOGIN_MAX_ATTEMPTS && attempts.window_start > now - LOGIN_WINDOW_MS) {
    const retryAfter = Math.ceil((attempts.window_start + LOGIN_WINDOW_MS - now) / 1000);
    c.header('Retry-After', String(retryAfter));
    throw new AppError(429, 'too_many_attempts', `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} min.`);
  }

  if (!(await safeEqual(password, c.env.ADMIN_PASSWORD))) {
    await registerFailure(c.env.DB, key, now, LOGIN_WINDOW_MS);
    throw new AppError(401, 'invalid_credentials', 'Senha incorreta.');
  }
  await clearAttempts(c.env.DB, key);

  const iat = Math.floor(now / 1000);
  const token = await sign({ sub: 'admin', iat, exp: iat + SESSION_TTL_SECONDS }, c.env.JWT_SECRET, 'HS256');
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function logout(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Aceita a sessão do painel (cookie) ou, se configurado, `Authorization: Bearer API_TOKEN`. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  assertConfigured(c.env);

  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (c.env.API_TOKEN && c.env.API_TOKEN.length >= 16 && (await safeEqual(token, c.env.API_TOKEN))) {
      c.set('authMethod', 'token');
      return next();
    }
    throw new AppError(401, 'unauthorized', 'Token de API inválido.');
  }

  const session = getCookie(c, SESSION_COOKIE);
  if (session) {
    try {
      await verify(session, c.env.JWT_SECRET, 'HS256');
      c.set('authMethod', 'session');
      return next();
    } catch {
      // cai no 401 abaixo
    }
  }
  throw new AppError(401, 'unauthorized', 'Faça login para continuar.');
};
