import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { clientIp } from '../lib/request';
import { CUSTOM_SLUG_RE } from '../lib/slug';
import { resolveSlug } from '../services/link-service';
import { recordScan } from '../services/scan-recorder';
import { expiredPage, inactivePage, notFoundPage } from '../views/pages';

export const redirectRoutes = new Hono<AppEnv>();

/**
 * Rota pública do QR. Caminho quente: uma leitura no cache em memória (ou uma
 * consulta indexada no SQLite), nenhuma agregação. O scan é gravado em segundo
 * plano depois que o 302 é devolvido.
 */
redirectRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  if (!CUSTOM_SLUG_RE.test(slug)) return notFoundPage();

  const link = await resolveSlug(c.env, slug);
  if (!link) return notFoundPage();
  if (!link.active) return inactivePage();
  if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) return expiredPage();

  // HEAD (verificadores de link) e coleta pausada (global ou do link) não gravam scan.
  if (c.req.method === 'GET' && link.track && !c.env.settings.analyticsPaused) {
    const headers = c.req.raw.headers;
    c.env.tasks.run(recordScan(c.env, headers, clientIp(headers, c.env.REMOTE_ADDR), link.id));
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: link.url,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
});
