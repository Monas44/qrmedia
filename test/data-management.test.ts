import { afterEach, describe, expect, it } from 'vitest';
import type { ImportResultDTO, Paginated, ScanRowDTO, StatsDTO } from '../src/shared/types';
import { parseAccessTime } from '../src/server/lib/period';
import { api, BROWSER_UA, call, createLink, env, json, scanCount } from './helpers';

const unique = () => `d${crypto.randomUUID().slice(0, 8)}`;
const post = (path: string, body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) });
const scan = (slug: string) => call(`/${slug}`, { headers: { 'User-Agent': BROWSER_UA } });

afterEach(async () => {
  await env.settings.setAnalyticsPaused(env.DB, false);
});

describe('pausar coleta', () => {
  it('pausa global: redireciona mas não grava scan', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });

    const res = await api('/settings', { method: 'PATCH', body: JSON.stringify({ analytics_paused: true }) });
    expect(await json(res)).toEqual({ ok: true, data: { analytics_paused: true } });
    expect((await scan(link.slug)).status).toBe(302);
    expect(await scanCount(link.id)).toBe(0);

    await api('/settings', { method: 'PATCH', body: JSON.stringify({ analytics_paused: false }) });
    await scan(link.slug);
    expect(await scanCount(link.id)).toBe(1);
  });

  it('pausa por link: só aquele link deixa de gravar', async () => {
    const paused = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const other = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });

    const res = await api(`/links/${paused.id}`, { method: 'PATCH', body: JSON.stringify({ analytics_paused: true }) });
    expect(await json(res)).toMatchObject({ ok: true, data: { analytics_paused: true } });

    expect((await scan(paused.slug)).status).toBe(302);
    await scan(other.slug);
    expect(await scanCount(paused.id)).toBe(0);
    expect(await scanCount(other.id)).toBe(1);
  });

  it('configurações exigem login', async () => {
    expect((await call('/api/settings')).status).toBe(401);
  });
});

describe('lançamento manual', () => {
  it('grava N acessos na data/hora informada (horário de Brasília) marcados como manual', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const res = await post('/scans/manual', { link_id: link.id, ts: '2026-10-01 14:30', count: 3, device_type: 'mobile' });
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ ok: true, data: { inserted: 3 } });

    const { results } = await env.DB.prepare('SELECT ts, source, device_type FROM scans WHERE link_id = ?1').bind(link.id).all();
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ ts: '2026-10-01T17:30:00.000Z', source: 'manual', device_type: 'mobile' });

    const stats = await json<StatsDTO>(await api(`/links/${link.id}/stats?from=2026-10-01&to=2026-10-01`));
    if (!stats.ok) throw new Error();
    expect(stats.data.kpis.total).toBe(3);
    expect(stats.data.imported_scans).toBe(3);
    expect(stats.data.heatmap).toEqual([{ dow: 4, hour: 14, count: 3 }]); // 01/10/2026 é quinta

    const page = await json<Paginated<ScanRowDTO>>(await api(`/links/${link.id}/scans?from=2026-10-01&to=2026-10-01`));
    if (!page.ok) throw new Error();
    expect(page.data.items[0]!.source).toBe('manual');
  });

  it.each([
    [{ ts: '2099-01-01 10:00', count: 1 }, 'invalid_time'],
    [{ ts: '31/02/2026 10:00', count: 1 }, 'invalid_time'],
    [{ ts: 'ontem', count: 1 }, 'invalid_time'],
  ])('rejeita %o', async (body, code) => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const res = await post('/scans/manual', { link_id: link.id, ...body });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ ok: false, error: { code } });
    expect(await scanCount(link.id)).toBe(0);
  });

  it('rejeita quantidade fora de 1–1000', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    expect((await post('/scans/manual', { link_id: link.id, ts: '2026-10-01 10:00', count: 0 })).status).toBe(400);
    expect((await post('/scans/manual', { link_id: link.id, ts: '2026-10-01 10:00', count: 1001 })).status).toBe(400);
  });
});

describe('importação de CSV', () => {
  it('importa planilha com data, hora, dispositivo e quantidade na página do link', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const csv = 'Data;Hora;Dispositivo;Quantidade\n01/10/2026;08:15;celular;2\n02/10/2026;19:40:05;computador;1\n';
    const res = await post('/scans/import', { csv, link_id: link.id });
    expect(res.status).toBe(201);
    expect(await json<ImportResultDTO>(res)).toEqual({ ok: true, data: { imported: 3, rows: 2, errors: [] } });

    const { results } = await env.DB.prepare('SELECT ts, device_type, source FROM scans WHERE link_id = ?1 ORDER BY ts').bind(link.id).all();
    expect(results).toEqual([
      { ts: '2026-10-01T11:15:00.000Z', device_type: 'mobile', source: 'import' },
      { ts: '2026-10-01T11:15:00.000Z', device_type: 'mobile', source: 'import' },
      { ts: '2026-10-02T22:40:05.000Z', device_type: 'desktop', source: 'import' },
    ]);
  });

  it('no analytics geral usa a coluna slug (aceita a URL curta inteira)', async () => {
    const a = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const b = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const csv = `slug,data_hora\n${a.slug},2026-10-03 10:00\nhttps://go.exemplo.com/${b.slug},2026-10-03 11:00\n`;
    const res = await post('/scans/import', { csv });
    expect(res.status).toBe(201);
    expect(await scanCount(a.id)).toBe(1);
    expect(await scanCount(b.id)).toBe(1);
  });

  it('com qualquer erro não importa nada e aponta as linhas', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const csv = `slug,data_hora\n${link.slug},2026-10-03 10:00\nnao-existe,2026-10-03 11:00\n${link.slug},amanhã\n`;
    const res = await post('/scans/import', { csv });
    expect(res.status).toBe(422);
    const body = await json<ImportResultDTO>(res);
    if (!body.ok) throw new Error();
    expect(body.data.imported).toBe(0);
    expect(body.data.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(await scanCount(link.id)).toBe(0);
  });

  it('restaura um CSV exportado (ida e volta)', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    await post('/scans/manual', { link_id: link.id, ts: '2026-09-20 09:00', count: 4, device_type: 'tablet' });
    const exported = await (await api(`/links/${link.id}/scans/export?from=2026-09-01&to=2026-09-30`)).text();
    expect(exported.split('\n')[0]).toContain('source');

    await post('/scans/clear', { link_id: link.id, only: 'all', confirm: 'APAGAR' });
    expect(await scanCount(link.id)).toBe(0);

    const res = await post('/scans/import', { csv: exported, link_id: link.id });
    expect(res.status).toBe(201);
    expect(await scanCount(link.id)).toBe(4);
  });

  it('exige coluna de data/hora', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const res = await post('/scans/import', { csv: 'dispositivo\ncelular\n', link_id: link.id });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: { code: 'missing_time_column' } });
  });
});

describe('limpar histórico', () => {
  it('exige a confirmação APAGAR', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    await scan(link.slug);
    const res = await post('/scans/clear', { link_id: link.id, only: 'all', confirm: 'apagar' });
    expect(res.status).toBe(400);
    expect(await scanCount(link.id)).toBe(1);
  });

  it('apaga só importados/manuais, só o período, ou tudo do link', async () => {
    const link = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const other = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    await scan(link.slug); // real, agora
    await scan(other.slug);
    await post('/scans/manual', { link_id: link.id, ts: '2026-09-10 10:00', count: 2 });
    await post('/scans/manual', { link_id: link.id, ts: '2026-09-20 10:00', count: 3 });
    expect(await scanCount(link.id)).toBe(6);

    let res = await post('/scans/clear', { link_id: link.id, from: '2026-09-01', to: '2026-09-15', only: 'all', confirm: 'APAGAR' });
    expect(await json(res)).toEqual({ ok: true, data: { matched: 2, deleted: 2 } });

    res = await post('/scans/clear', { link_id: link.id, only: 'imported', confirm: 'APAGAR' });
    expect(await json(res)).toEqual({ ok: true, data: { matched: 3, deleted: 3 } });
    expect(await scanCount(link.id)).toBe(1); // sobrou o scan real

    res = await post('/scans/clear', { link_id: link.id, only: 'all', confirm: 'APAGAR' });
    expect(await json(res)).toEqual({ ok: true, data: { matched: 1, deleted: 1 } });
    expect(await scanCount(other.id)).toBe(1); // outro link intacto
  });
});

describe('parseAccessTime', () => {
  it('interpreta horário de Brasília e ISO com fuso', () => {
    expect(parseAccessTime('2026-10-18 14:30')?.toISOString()).toBe('2026-10-18T17:30:00.000Z');
    expect(parseAccessTime('18/10/2026 23:59:59')?.toISOString()).toBe('2026-10-19T02:59:59.000Z');
    expect(parseAccessTime('2026-10-18T14:30:00.000Z')?.toISOString()).toBe('2026-10-18T14:30:00.000Z');
    expect(parseAccessTime('2026-13-01 10:00')).toBeNull();
    expect(parseAccessTime('18/10/2026')).toBeNull();
  });
});

describe('limpar histórico: horas, vários QR codes e prévia', () => {
  async function setup() {
    const a = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const b = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    const c = await createLink({ slug: unique(), destination_url: 'https://exemplo.com/' });
    for (const link of [a, b, c]) {
      await post('/scans/manual', { link_id: link.id, ts: '2026-10-05 08:00', count: 1 });
      await post('/scans/manual', { link_id: link.id, ts: '2026-10-05 12:30', count: 2 });
      await post('/scans/manual', { link_id: link.id, ts: '2026-10-05 18:00', count: 4 });
    }
    return { a, b, c };
  }

  it('apaga só a faixa de horário escolhida, com fim inclusivo', async () => {
    const { a } = await setup();
    const res = await post('/scans/clear', { link_ids: [a.id], from: '2026-10-05 12:00', to: '2026-10-05 12:30', only: 'all', confirm: 'APAGAR' });
    expect(await json(res)).toEqual({ ok: true, data: { matched: 2, deleted: 2 } }); // 12:30 incluído
    expect(await scanCount(a.id)).toBe(5);
  });

  it('apaga de vários QR codes de uma vez e não toca nos outros', async () => {
    const { a, b, c } = await setup();
    const res = await post('/scans/clear', { link_ids: [a.id, b.id], from: '05/10/2026 00:00', to: '05/10/2026 23:59', only: 'all', confirm: 'APAGAR' });
    expect(await json(res)).toEqual({ ok: true, data: { matched: 14, deleted: 14 } });
    expect(await scanCount(a.id)).toBe(0);
    expect(await scanCount(b.id)).toBe(0);
    expect(await scanCount(c.id)).toBe(7);
  });

  it('prévia (dry_run) conta sem apagar e dispensa a confirmação', async () => {
    const { a, b } = await setup();
    const res = await post('/scans/clear', { link_ids: [a.id, b.id], from: '2026-10-05 08:00', to: '2026-10-05 12:29', only: 'all', dry_run: true });
    expect(await json(res)).toEqual({ ok: true, data: { matched: 2, deleted: 0 } });
    expect(await scanCount(a.id)).toBe(7);
  });

  it('recusa lista vazia de QR codes, link inexistente e início depois do fim', async () => {
    const { a } = await setup();
    expect((await post('/scans/clear', { link_ids: [], only: 'all', confirm: 'APAGAR' })).status).toBe(400);
    expect((await post('/scans/clear', { link_ids: [a.id, 999999], only: 'all', confirm: 'APAGAR' })).status).toBe(404);
    const res = await post('/scans/clear', { link_ids: [a.id], from: '2026-10-05 18:00', to: '2026-10-05 08:00', only: 'all', confirm: 'APAGAR' });
    expect(res.status).toBe(400);
    expect(await scanCount(a.id)).toBe(7);
  });
});
