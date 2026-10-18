import { Hono, type MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppConfigDTO } from '../../../shared/types';
import type { AppEnv } from '../../env';
import { AppError, ok } from '../../lib/http';
import { APP_TIMEZONE } from '../../lib/period';
import { publicBaseUrl } from '../../lib/request';
import { requireAuth } from '../../services/auth-service';
import { authRoutes } from './auth';
import { linkRoutes } from './links';
import { statsRoutes } from './stats';

export const apiRoutes = new Hono<AppEnv>();

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: além do cookie SameSite=Strict, recusa escrita vinda de outra origem.
 * Clientes de servidor (Bearer token) não mandam Origin e passam normalmente.
 */
const sameOriginWrites: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const site = c.req.header('Sec-Fetch-Site');
    const origin = c.req.header('Origin');
    if ((site && site !== 'same-origin' && site !== 'none') || (origin && origin !== new URL(c.req.url).origin)) {
      throw new AppError(403, 'cross_origin', 'Requisição de outra origem bloqueada.');
    }
  }
  await next();
};

apiRoutes.use('*', secureHeaders(), sameOriginWrites);
apiRoutes.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

apiRoutes.route('/auth', authRoutes);

// Tudo abaixo exige sessão (cookie) ou API_TOKEN.
apiRoutes.use('*', requireAuth);
apiRoutes.get('/config', (c) => ok<AppConfigDTO>(c, { base_url: publicBaseUrl(c), timezone: APP_TIMEZONE }));
apiRoutes.route('/links', linkRoutes);
apiRoutes.route('/', statsRoutes);

apiRoutes.all('*', () => {
  throw new AppError(404, 'not_found', 'Rota da API não encontrada.');
});
