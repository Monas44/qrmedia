import { describe, expect, it } from 'vitest';
import type { StatsDTO } from '../src/shared/types';
import { isBot } from '../src/server/services/bot';
import { api, BROWSER_UA, call, createLink, env, json, scanCount } from './helpers';

const BOT_UAS = [
  'WhatsApp/2.23.20.0 A',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'TelegramBot (like TwitterBot)',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Applebot/0.1)',
  'curl/8.4.0',
  'python-requests/2.31.0',
  '',
];

const HUMAN_UAS = [
  BROWSER_UA,
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];

describe('detecção de bots', () => {
  it.each(BOT_UAS)('marca como bot: %s', (ua) => expect(isBot(ua)).toBe(true));
  it.each(HUMAN_UAS)('não marca navegador real: %s', (ua) => expect(isBot(ua)).toBe(false));

  it('grava is_bot = 1 e exclui bots das estatísticas por padrão', async () => {
    const link = await createLink({ slug: `b${crypto.randomUUID().slice(0, 8)}`, destination_url: 'https://exemplo.com/' });

    const preview = await call(`/${link.slug}`, { headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' } });
    expect(preview.status).toBe(302); // o bot também é redirecionado
    await call(`/${link.slug}`, { headers: { 'User-Agent': BROWSER_UA } });
    expect(await scanCount(link.id)).toBe(2);

    const flags = await env.DB.prepare('SELECT is_bot FROM scans WHERE link_id = ? ORDER BY id').bind(link.id).all<{ is_bot: number }>();
    expect(flags.results.map((r) => r.is_bot)).toEqual([1, 0]);

    const withoutBots = await json<StatsDTO>(await api(`/links/${link.id}/stats`));
    const withBots = await json<StatsDTO>(await api(`/links/${link.id}/stats?bots=1`));
    if (!withoutBots.ok || !withBots.ok) throw new Error('stats falhou');
    expect(withoutBots.data.kpis.total).toBe(1);
    expect(withoutBots.data.bot_scans).toBe(1);
    expect(withBots.data.kpis.total).toBe(2);
  });
});
