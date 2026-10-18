import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import type { ApiFailure, ApiSuccess } from '../../shared/types';

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Recurso') => new AppError(404, 'not_found', `${what} não encontrado.`);

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json<ApiSuccess<T>>({ ok: true, data }, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
  const body: ApiFailure = { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
  return c.json(body, status);
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) return fail(c, err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return fail(c, 400, 'validation_error', 'Dados inválidos.', details);
  }
  if (err instanceof HTTPException) {
    return fail(c, err.status as ContentfulStatusCode, 'http_error', err.message || 'Erro na requisição.');
  }
  console.error('unhandled_error', err);
  return fail(c, 500, 'internal_error', 'Erro interno do servidor.');
};

/** Lê o corpo JSON sem lançar SyntaxError cru. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(400, 'invalid_json', 'O corpo da requisição deve ser um JSON válido.');
  }
}
