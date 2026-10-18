import { describe, expect, it } from 'vitest';
import { BROWSER_UA, call, createLink, env, scanCount } from './helpers';

const unique = () => `t${crypto.randomUUID().slice(0, 8)}`;

describe('GET /:slug (redirect)', () => {
  it('responde 302 para o destino com UTMs e Cache-Control no-store', async () => {
    const link = await createLink({
      slug: unique(),
      destination_url: 'https://exemplo.com/promo?ref=qr',
      utm_source: 'qrcode',
      utm_campaign: 'outubro',
    });

    const res = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });

    expect(res.status).toBe(302);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const location = new URL(res.headers.get('Location')!);
    expect(location.origin + location.pathname).toBe('https://exemplo.com/promo');
    expect(location.searchParams.get('ref')).toBe('qr');
    expect(location.searchParams.get('utm_source')).toBe('qrcode');
    expect(location.searchParams.get('utm_campaign')).toBe('outubro');
    expect(location.searchParams.has('utm_medium')).toBe(false);
  });

  it('não sobrescreve UTMs que já existem no destino', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/?utm_source=original', utm_source: 'qrcode' });
    const res = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(new URL(res.headers.get('Location')!).searchParams.get('utm_source')).toBe('original');
  });

  it('trata o slug sem diferenciar maiúsculas', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const res = await call(`/${link.slug.toUpperCase()}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(res.status).toBe(302);
  });

  it('retorna 404 para link inexistente', async () => {
    const res = await call('/nao-existe-xyz');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('Link não encontrado');
  });

  it('retorna 410 para link expirado', async () => {
    const link = await createLink({
      slug: unique(),
      destination_url: 'https://exemplo.com/',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('Link expirado');
    expect(await scanCount(link.id)).toBe(0);
  });

  it('retorna 404 para link desativado', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/', is_active: false });
    const res = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('desativado');
  });

  it('busca no banco quando o slug não está no cache e repopula o cache', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/fallback' });
    env.cache.clear();

    const res = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://exemplo.com/fallback');
    expect(env.cache.get(link.slug)).toMatchObject({ id: link.id, url: 'https://exemplo.com/fallback', active: true });
  });
});

describe('registro do scan', () => {
  it('grava o scan com dispositivo, idioma, origem e hash de visitante (sem IP)', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const ip = '203.0.113.45';

    const res = await call(`/${link.slug}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'pt-br,pt;q=0.9,en;q=0.8',
        'X-Real-IP': ip,
        Referer: 'https://instagram.com/perfil/123?x=1',
      },
    });
    expect(res.status).toBe(302);
    expect(await scanCount(link.id)).toBe(1);

    const scan = await env.DB.prepare('SELECT * FROM scans WHERE link_id = ?').bind(link.id).first<Record<string, unknown>>();
    expect(scan).toMatchObject({
      device_type: 'mobile',
      os: 'iOS',
      browser: 'Mobile Safari',
      language: 'pt-BR',
      referrer: 'instagram.com',
      is_bot: 0,
    });
    expect(scan!.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(scan)).not.toContain(ip);
    expect(Date.parse(String(scan!.ts))).toBeGreaterThan(Date.now() - 60_000);
  });

  it('usa o mesmo hash para o mesmo visitante no mesmo dia e hashes diferentes para IPs diferentes', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const hit = (ip: string) => call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA, 'X-Real-IP': ip } });
    await hit('198.51.100.1');
    await hit('198.51.100.1');
    await hit('198.51.100.2');
    expect(await scanCount(link.id)).toBe(3);

    const { results } = await env.DB.prepare('SELECT visitor_hash FROM scans WHERE link_id = ? ORDER BY id').bind(link.id).all<{ visitor_hash: string }>();
    expect(results[0]!.visitor_hash).toBe(results[1]!.visitor_hash);
    expect(results[2]!.visitor_hash).not.toBe(results[0]!.visitor_hash);
  });

  it('não conta requisições HEAD como scan', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const res = await call(`/${link.slug}`, { method: 'HEAD', headers: { 'User-Agent': BROWSER_UA } });
    expect(res.status).toBe(302);
    expect(await scanCount(link.id)).toBe(0);
  });

  it('mantém o redirect mesmo se a gravação do scan falhar', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/resiliente' });
    // Remove o link só do D1: o KV ainda resolve, mas o INSERT em scans viola a FK.
    await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(link.id).run();

    const res = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://exemplo.com/resiliente');
  });
});
