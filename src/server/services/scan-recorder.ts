import type { Env } from '../env';
import { referrerHost } from '../lib/url';
import { insertScan, type NewScan } from '../repositories/scans-repo';
import { isBot } from './bot';
import { parseUserAgent } from './user-agent';
import { visitorHash } from './visitor-hash';

const clip = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

/** Primeira tag de Accept-Language, ex.: "pt-BR,pt;q=0.9" → "pt-BR". */
export function primaryLanguage(header: string | null): string | null {
  const first = header?.split(',')[0]?.split(';')[0]?.trim();
  if (!first || first === '*' || !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(first)) return null;
  const [lang, ...rest] = first.split('-');
  return [lang!.toLowerCase(), ...rest.map((p) => (p.length === 2 ? p.toUpperCase() : p))].join('-').slice(0, 35);
}

export async function buildScan(env: Env, headers: Headers, ip: string, linkId: number, now: Date): Promise<NewScan> {
  const ua = headers.get('User-Agent') ?? '';
  const parsed = parseUserAgent(ua);

  return {
    link_id: linkId,
    ts: now.toISOString(),
    device_type: parsed.device_type,
    os: clip(parsed.os, 64),
    browser: clip(parsed.browser, 64),
    referrer: referrerHost(headers.get('Referer')),
    language: primaryLanguage(headers.get('Accept-Language')),
    visitor_hash: await visitorHash(env.DB, ip, ua, now),
    is_bot: isBot(ua) ? 1 : 0,
  };
}

/**
 * Roda em segundo plano (env.tasks): o 302 já foi respondido. Qualquer falha é
 * apenas logada — o redirect nunca depende da gravação.
 */
export async function recordScan(env: Env, headers: Headers, ip: string, linkId: number, now = new Date()): Promise<void> {
  try {
    await insertScan(env.DB, await buildScan(env, headers, ip, linkId, now));
  } catch (err) {
    console.error('scan_record_failed', { linkId, err: String(err) });
  }
}
