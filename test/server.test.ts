import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/server/lib/request';
import { BROWSER_UA, call, createLink, env, scanCount } from './helpers';

describe('servidor Node', () => {
  it('responde ao healthcheck do Railway', async () => {
    const res = await call('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, storage: 'local' });
  });

  it.each(['/app/', '/app/links/42', '/app/analytics'])('entrega o index.html da SPA em %s', async (path) => {
    const res = await call(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('QR Dinâmico');
  });

  it('redireciona a raiz para o painel', async () => {
    const res = await call('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/app/');
  });

  it('não aceita "healthz" como slug', async () => {
    const res = await call('/api/links', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'healthz', destination_url: 'https://exemplo.com/' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('IP do cliente atrás do proxy', () => {
  it('prioriza X-Real-IP, depois o primeiro X-Forwarded-For, depois o socket', () => {
    expect(clientIp(new Headers({ 'X-Real-IP': '1.1.1.1', 'X-Forwarded-For': '2.2.2.2' }), '3.3.3.3')).toBe('1.1.1.1');
    expect(clientIp(new Headers({ 'X-Forwarded-For': '2.2.2.2, 10.0.0.1' }), '3.3.3.3')).toBe('2.2.2.2');
    expect(clientIp(new Headers(), '3.3.3.3')).toBe('3.3.3.3');
  });
});

describe('salt diário', () => {
  it('fica no banco, é reutilizado no mesmo dia e apaga salts antigos', async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO daily_salts (day, salt) VALUES ('2000-01-01', 'antigo')").run();
    const link = await createLink({ slug: `s${crypto.randomUUID().slice(0, 8)}`, destination_url: 'https://exemplo.com/' });

    await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA, 'X-Real-IP': '198.51.100.7' } });
    await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA, 'X-Real-IP': '198.51.100.7' } });
    expect(await scanCount(link.id)).toBe(2);

    const salts = await env.DB.prepare('SELECT day FROM daily_salts').all<{ day: string }>();
    expect(salts.results.map((s) => s.day)).not.toContain('2000-01-01');
    expect(salts.results).toHaveLength(1);

    const hashes = await env.DB.prepare('SELECT DISTINCT visitor_hash FROM scans WHERE link_id = ?1').bind(link.id).all();
    expect(hashes.results).toHaveLength(1);
  });
});
