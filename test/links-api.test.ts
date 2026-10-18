import { describe, expect, it } from 'vitest';
import type { LinkDetailDTO, LinkDTO, LinkListItemDTO, Paginated, ScanRowDTO, StatsDTO } from '../src/shared/types';
import { api, BROWSER_UA, call, createLink, env, json, scanCount } from './helpers';

const unique = () => `l${crypto.randomUUID().slice(0, 8)}`;

describe('CRUD de links', () => {
  it('gera slug de 6 caracteres sem caracteres ambíguos', async () => {
    const link = await createLink({ destination_url: 'https://exemplo.com/' });
    expect(link.slug).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
    expect(link.short_url).toBe(`https://go.exemplo.com/${link.slug}`);
  });

  it.each(['javascript:alert(1)', 'ftp://exemplo.com/arquivo', 'exemplo.com', 'data:text/html,oi'])(
    'rejeita destino não http/https: %s',
    async (destination_url) => {
      const res = await api('/links', { method: 'POST', body: JSON.stringify({ destination_url }) });
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.ok).toBe(false);
    },
  );

  it('rejeita slug reservado e slug duplicado', async () => {
    const reserved = await api('/links', { method: 'POST', body: JSON.stringify({ slug: 'api', destination_url: 'https://exemplo.com/' }) });
    expect(reserved.status).toBe(400);

    const slug = unique();
    await createLink({ slug, destination_url: 'https://exemplo.com/' });
    const dup = await api('/links', { method: 'POST', body: JSON.stringify({ slug, destination_url: 'https://exemplo.com/' }) });
    expect(dup.status).toBe(409);
  });

  it('edita o destino, grava histórico e atualiza o redirect (KV)', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/antigo', tags: ['Evento', 'evento', 'loja'] });
    expect(link.tags).toEqual(['evento', 'loja']);

    const res = await api(`/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ destination_url: 'https://exemplo.com/novo' }) });
    expect(res.status).toBe(200);

    const detail = await json<LinkDetailDTO>(await api(`/links/${link.id}`));
    if (!detail.ok) throw new Error();
    expect(detail.data.history).toHaveLength(1);
    expect(detail.data.history[0]).toMatchObject({ old_url: 'https://exemplo.com/antigo', new_url: 'https://exemplo.com/novo' });

    const redirect = await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(redirect.headers.get('Location')).toBe('https://exemplo.com/novo');
  });

  it('desativa e reativa o link', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    await api(`/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
    expect((await call(`/${link.slug}`)).status).toBe(404);
    await api(`/links/${link.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) });
    expect((await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } })).status).toBe(302);
  });

  it('lista links com busca, filtro por tag e contagem de scans', async () => {
    const tag = unique();
    const a = await createLink({ slug: unique(), title: 'Cardápio do restaurante', destination_url: 'https://exemplo.com/a', tags: [tag] });
    await createLink({ slug: unique(), title: 'Outro', destination_url: 'https://exemplo.com/b' });
    await call(`/${a.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    await scanCount(a.id);

    const byTag = await json<LinkListItemDTO[]>(await api(`/links?tag=${tag}`));
    if (!byTag.ok) throw new Error();
    expect(byTag.data.map((l) => l.id)).toEqual([a.id]);
    expect(byTag.data[0]).toMatchObject({ total_scans: 1, scans_24h: 1 });

    const bySearch = await json<LinkListItemDTO[]>(await api(`/links?q=${encodeURIComponent('cardápio')}`));
    if (!bySearch.ok) throw new Error();
    expect(bySearch.data.some((l) => l.id === a.id)).toBe(true);
  });

  it('exclui o link e remove o cache do redirect', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    expect((await api(`/links/${link.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(env.cache.get(link.slug)).toBeUndefined();
    expect((await call(`/${link.slug}`)).status).toBe(404);
    expect((await api(`/links/${link.id}`)).status).toBe(404);
  });
});

describe('estatísticas', () => {
  async function seedScans(linkId: number) {
    // 3 scans hoje (2 visitantes), 1 ontem, 1 bot hoje, 2 no período anterior.
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const rows: [string, string, string, number][] = [
      [iso(60_000), 'mobile', 'v1', 0],
      [iso(120_000), 'mobile', 'v1', 0],
      [iso(180_000), 'desktop', 'v2', 0],
      [iso(86_400_000 + 1_000), 'tablet', 'v3', 0],
      [iso(30_000), 'desktop', 'bot', 1],
      [iso(9 * 86_400_000), 'mobile', 'v9', 0],
      [iso(10 * 86_400_000), 'mobile', 'v9', 0],
    ];
    await env.DB.batch(
      rows.map(([ts, device, hash, bot]) =>
        env.DB.prepare('INSERT INTO scans (link_id, ts, device_type, visitor_hash, is_bot) VALUES (?, ?, ?, ?, ?)').bind(linkId, ts, device, hash, bot),
      ),
    );
  }

  it('GET /api/links/:id/stats retorna KPIs, comparação e agregados', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    await seedScans(link.id);

    const from = new Date(Date.now() - 7 * 86_400_000 + 1).toISOString();
    const to = new Date(Date.now() + 1000).toISOString();
    const res = await api(`/links/${link.id}/stats?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    const body = await json<StatsDTO>(res);
    if (!body.ok) throw new Error(JSON.stringify(body.error));
    const s = body.data;

    expect(s.kpis.total).toBe(4);
    expect(s.kpis.unique_visitors).toBe(3);
    expect(s.previous.total).toBe(2);
    expect(s.change.total).toBe(100);
    expect(s.bot_scans).toBe(1);
    expect(s.daily.reduce((sum, d) => sum + d.count, 0)).toBe(4);
    expect(s.devices[0]).toEqual({ label: 'mobile', count: 2 });
    expect(s.devices.find((d) => d.label === 'mobile')?.count).toBe(2);
    expect(s.heatmap.reduce((sum, h) => sum + h.count, 0)).toBe(4);
    expect(s.range.timezone).toBe('America/Sao_Paulo');
  });

  it('valida o período', async () => {
    const res = await api('/stats?from=2026-02-10&to=2026-01-01');
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ ok: false, error: { code: 'invalid_period' } });
  });

  it('pagina scans recentes e exporta CSV sem dados pessoais', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    await seedScans(link.id);

    const page = await json<Paginated<ScanRowDTO>>(await api(`/links/${link.id}/scans?page=1&page_size=2`));
    if (!page.ok) throw new Error();
    expect(page.data.total).toBe(6); // período padrão de 30 dias, sem bots
    expect(page.data.items).toHaveLength(2);
    expect(page.data.items[0]).not.toHaveProperty('visitor_hash');

    const csv = await api(`/links/${link.id}/scans/export?bots=1`);
    expect(csv.headers.get('Content-Type')).toContain('text/csv');
    const lines = (await csv.text()).trim().split('\n');
    expect(lines[0]).toContain('ts,ts_local,slug,device_type');
    expect(lines).toHaveLength(1 + 7); // cabeçalho + 6 humanos + 1 bot
    expect(lines.join('\n')).not.toContain('v1');
  });

  it('retorna 404 em stats de link inexistente', async () => {
    const res = await api('/links/999999/stats');
    expect(res.status).toBe(404);
  });
});

describe('rotas do app', () => {
  it('rotas desconhecidas da API retornam 404 JSON', async () => {
    const res = await api('/nao-existe');
    expect(res.status).toBe(404);
    expect(await json<LinkDTO>(res)).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});
