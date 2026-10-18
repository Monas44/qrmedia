import type { Database } from '../db';

export interface NewScan {
  link_id: number;
  ts: string;
  device_type: string;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  language: string | null;
  visitor_hash: string;
  is_bot: number;
  source?: 'qr' | 'import' | 'manual';
}

export async function insertScan(db: Database, s: NewScan): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scans (link_id, ts, device_type, os, browser, referrer, language, visitor_hash, is_bot, source)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(s.link_id, s.ts, s.device_type, s.os, s.browser, s.referrer, s.language, s.visitor_hash, s.is_bot, s.source ?? 'qr')
    .run();
}
