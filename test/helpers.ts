import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ApiResponse, LinkDTO, LinkInput } from '../src/shared/types';
import { migrate, openDatabase } from '../src/server/db';
import type { Env } from '../src/server/env';
import { createApp } from '../src/server/index';
import { BackgroundTasks } from '../src/server/lib/background';
import { RedirectCache } from '../src/server/services/redirect-cache';

export const BASE = 'https://go.exemplo.com';
export const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// Cada arquivo de teste roda isolado e ganha seu próprio banco em memória.
const db = openDatabase(':memory:');
migrate(db, resolve(__dirname, '../migrations'));

export const env: Env = {
  DB: db,
  cache: new RedirectCache(),
  tasks: new BackgroundTasks(),
  ADMIN_PASSWORD: 'senha-de-teste',
  JWT_SECRET: 'segredo-de-teste-com-32-caracteres!!',
  API_TOKEN: 'token-de-integracao-teste',
  PUBLIC_BASE_URL: 'https://go.exemplo.com',
  REMOTE_ADDR: '127.0.0.1',
};

// Build mínimo do painel para testar o fallback da SPA.
const clientDir = mkdtempSync(join(tmpdir(), 'qr-client-'));
mkdirSync(join(clientDir, 'app'), { recursive: true });
writeFileSync(join(clientDir, 'app', 'index.html'), '<!doctype html><title>QR Dinâmico</title><div id="root"></div>');

const app = createApp({ clientDir });

export function call(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.fetch(new Request(`${BASE}${path}`, { redirect: 'manual', ...init }), env));
}

export function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${env.API_TOKEN}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return call(`/api${path}`, { ...init, headers });
}

export async function json<T>(res: Response): Promise<ApiResponse<T>> {
  return (await res.json()) as ApiResponse<T>;
}

export async function createLink(input: LinkInput): Promise<LinkDTO> {
  const res = await api('/links', { method: 'POST', body: JSON.stringify(input) });
  const body = await json<LinkDTO>(res);
  if (!body.ok) throw new Error(`createLink falhou: ${JSON.stringify(body.error)}`);
  return body.data;
}

/** Espera as gravações em segundo plano e devolve quantos scans o link tem. */
export async function scanCount(linkId: number): Promise<number> {
  await env.tasks.idle();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM scans WHERE link_id = ?1').bind(linkId).first<{ n: number }>();
  return row?.n ?? 0;
}
