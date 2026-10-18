import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppEnv } from './env';
import { errorHandler } from './lib/http';
import { apiRoutes } from './routes/api';
import { redirectRoutes } from './routes/redirect';
import { notFoundPage } from './views/pages';

export interface AppOptions {
  /** Pasta com o build do painel (contém app/index.html). */
  clientDir: string;
}

export function createApp({ clientDir }: AppOptions) {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.route('/api', apiRoutes);

  // Painel: arquivos com hash em /app/assets são imutáveis; o resto da SPA recebe o index.html.
  app.get('/', (c) => c.redirect('/app/', 302));
  app.get('/app', (c) => c.redirect('/app/', 301));
  app.use(
    '/app/assets/*',
    serveStatic({
      root: clientDir,
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  // Outros arquivos do painel (favicon etc.): só caminhos com extensão; o resto é rota da SPA.
  const publicFiles = serveStatic<AppEnv>({ root: clientDir });
  app.use('/app/*', (c, next) => (/\.[a-z0-9]+$/i.test(c.req.path) ? publicFiles(c, next) : next()));

  let indexHtml: string | null = null;
  app.get('/app/*', (c) => {
    try {
      indexHtml ??= readFileSync(join(clientDir, 'app', 'index.html'), 'utf8');
    } catch {
      return c.text('Painel não encontrado. Rode `npm run build` antes de iniciar o servidor.', 503);
    }
    c.header('Cache-Control', 'no-cache');
    return c.html(indexHtml);
  });

  app.route('/', redirectRoutes);
  app.notFound(() => notFoundPage());

  return app;
}
