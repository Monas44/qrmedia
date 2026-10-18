import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { migrate, openDatabase } from './db';
import type { Env } from './env';
import { createApp } from './index';
import { BackgroundTasks } from './lib/background';
import { RedirectCache } from './services/redirect-cache';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) {
    console.error(`Variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return value;
};

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DATABASE_PATH ?? './data/qr.db';
// Atrás do proxy do Railway (padrão), confia em X-Forwarded-Proto/X-Real-IP.
const trustProxy = process.env.TRUST_PROXY !== 'false';

if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  console.warn(
    'ATENÇÃO: nenhum volume do Railway está montado. O banco SQLite será APAGADO a cada deploy. ' +
      'Crie um volume com mount path /data e use DATABASE_PATH=/data/qr.db.',
  );
}

const db = openDatabase(dbPath);
const applied = migrate(db, resolve(process.env.MIGRATIONS_DIR ?? './migrations'));
if (applied.length) console.log(`Migrations aplicadas: ${applied.join(', ')}`);

const tasks = new BackgroundTasks();
const baseEnv: Omit<Env, 'REMOTE_ADDR'> = {
  DB: db,
  cache: new RedirectCache(),
  tasks,
  ADMIN_PASSWORD: required('ADMIN_PASSWORD'),
  JWT_SECRET: required('JWT_SECRET'),
  API_TOKEN: process.env.API_TOKEN || undefined,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || undefined,
};

const app = createApp({ clientDir: resolve(process.env.CLIENT_DIR ?? './dist/client') });

const server = serve(
  {
    port,
    hostname: '0.0.0.0',
    fetch: (request, bindings) => {
      const remote = 'incoming' in bindings ? bindings.incoming.socket.remoteAddress : undefined;
      const url = new URL(request.url);
      const headers = new Headers(request.headers);

      if (trustProxy) {
        // O proxy termina o HTTPS; reconstrói a URL pública para cookies Secure,
        // checagem de Origin e URLs curtas.
        const proto = headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim();
        if (proto === 'https' && url.protocol === 'http:') {
          url.protocol = 'https:';
          url.port = '';
        }
      } else {
        // Sem proxy confiável, cabeçalhos de IP enviados pelo cliente são ignorados.
        headers.delete('X-Real-IP');
        headers.delete('X-Forwarded-For');
      }

      const req =
        url.href === request.url && trustProxy
          ? request
          : new Request(url, {
              method: request.method,
              headers,
              body: request.body,
              signal: request.signal,
              ...(request.body ? { duplex: 'half' } : {}),
            } as RequestInit);
      return app.fetch(req, { ...baseEnv, REMOTE_ADDR: remote });
    },
  },
  (info) => console.log(`Servidor ouvindo em http://localhost:${info.port} (banco: ${dbPath})`),
);

// Railway envia SIGTERM no redeploy: termina os scans pendentes e fecha o banco.
const shutdown = async (signal: string) => {
  console.log(`${signal} recebido, encerrando…`);
  server.close();
  await tasks.idle();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
