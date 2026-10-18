import type { Database, SqlValue } from '../db';
import type { CountItem, ScanRowDTO } from '../../shared/types';
import { SQL_TZ_MODIFIER } from '../lib/period';

export interface ScanFilter {
  from: string; // ISO UTC, inclusivo
  to: string; // ISO UTC, exclusivo
  linkId: number | null;
  includeBots: boolean;
}

/**
 * Todo filtro começa por (link_id, ts) ou (ts), que são os prefixos dos índices
 * idx_scans_link_ts e idx_scans_ts — nenhuma agregação faz full scan em `scans`.
 */
function where(f: ScanFilter, alias = 's'): { sql: string; params: SqlValue[] } {
  const parts: string[] = [];
  const params: SqlValue[] = [];
  if (f.linkId !== null) {
    parts.push(`${alias}.link_id = ?`);
    params.push(f.linkId);
  }
  parts.push(`${alias}.ts >= ?`, `${alias}.ts < ?`);
  params.push(f.from, f.to);
  if (!f.includeBots) parts.push(`${alias}.is_bot = 0`);
  return { sql: parts.join(' AND '), params };
}

const TZ = `'${SQL_TZ_MODIFIER}'`;

export interface RawStats {
  totals: { total: number; unique_visitors: number };
  prevTotals: { total: number; unique_visitors: number };
  prevPeak: { day: string; count: number } | null;
  botScans: number;
  daily: { day: string; count: number; unique: number }[];
  heatmap: { dow: number; hour: number; count: number }[];
  devices: CountItem[];
  os: CountItem[];
  browsers: CountItem[];
  referrers: CountItem[];
  languages: CountItem[];
  topLinks: { link_id: number; slug: string; title: string | null; count: number }[];
}

/** Executa todas as agregações em um único round-trip (db.batch). */
export async function aggregateStats(db: Database, f: ScanFilter, prev: ScanFilter): Promise<RawStats> {
  const w = where(f);
  const pw = where(prev);
  const bw = where({ ...f, includeBots: true });

  const groupBy = (column: string, limit: number) =>
    db
      .prepare(`SELECT ${column} AS label, COUNT(*) AS count FROM scans s WHERE ${w.sql} GROUP BY label ORDER BY count DESC LIMIT ${limit}`)
      .bind(...w.params);

  const statements = [
    db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT visitor_hash) AS unique_visitors FROM scans s WHERE ${w.sql}`).bind(...w.params),
    db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT visitor_hash) AS unique_visitors FROM scans s WHERE ${pw.sql}`).bind(...pw.params),
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d', ts, ${TZ}) AS day, COUNT(*) AS count FROM scans s WHERE ${pw.sql}
         GROUP BY day ORDER BY count DESC, day ASC LIMIT 1`,
      )
      .bind(...pw.params),
    db.prepare(`SELECT COUNT(*) AS count FROM scans s WHERE ${bw.sql} AND s.is_bot = 1`).bind(...bw.params),
    db
      .prepare(
        `SELECT strftime('%Y-%m-%d', ts, ${TZ}) AS day, COUNT(*) AS count, COUNT(DISTINCT visitor_hash) AS "unique"
         FROM scans s WHERE ${w.sql} GROUP BY day ORDER BY day`,
      )
      .bind(...w.params),
    db
      .prepare(
        `SELECT CAST(strftime('%w', ts, ${TZ}) AS INTEGER) AS dow, CAST(strftime('%H', ts, ${TZ}) AS INTEGER) AS hour, COUNT(*) AS count
         FROM scans s WHERE ${w.sql} GROUP BY dow, hour`,
      )
      .bind(...w.params),
    groupBy('device_type', 5),
    groupBy('os', 12),
    groupBy('browser', 12),
    groupBy('referrer', 15),
    groupBy('language', 15),
  ];

  if (f.linkId === null) {
    statements.push(
      db
        .prepare(
          `SELECT s.link_id, l.slug, l.title, COUNT(*) AS count FROM scans s JOIN links l ON l.id = s.link_id
           WHERE ${w.sql} GROUP BY s.link_id ORDER BY count DESC LIMIT 10`,
        )
        .bind(...w.params),
    );
  }

  const r = await db.batch(statements);
  const rows = <T>(i: number) => (r[i]?.results ?? []) as T[];
  const one = <T>(i: number) => rows<T>(i)[0];

  return {
    totals: one<RawStats['totals']>(0) ?? { total: 0, unique_visitors: 0 },
    prevTotals: one<RawStats['totals']>(1) ?? { total: 0, unique_visitors: 0 },
    prevPeak: one<{ day: string; count: number }>(2) ?? null,
    botScans: one<{ count: number }>(3)?.count ?? 0,
    daily: rows(4),
    heatmap: rows(5),
    devices: rows(6),
    os: rows(7),
    browsers: rows(8),
    referrers: rows(9),
    languages: rows(10),
    topLinks: f.linkId === null ? rows(11) : [],
  };
}

const SCAN_ROW_SQL = `s.id, s.ts, s.link_id, l.slug, s.device_type, s.os, s.browser, s.referrer, s.language, s.is_bot`;

type RawScanRow = Omit<ScanRowDTO, 'is_bot'> & { is_bot: number };
const toScanRow = (r: RawScanRow): ScanRowDTO => ({ ...r, is_bot: r.is_bot === 1 });

export async function listScans(db: Database, f: ScanFilter, page: number, pageSize: number) {
  const w = where(f);
  const [items, total] = await db.batch([
    db
      .prepare(
        `SELECT ${SCAN_ROW_SQL} FROM scans s JOIN links l ON l.id = s.link_id
         WHERE ${w.sql} ORDER BY s.ts DESC, s.id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...w.params, pageSize, (page - 1) * pageSize),
    db.prepare(`SELECT COUNT(*) AS total FROM scans s WHERE ${w.sql}`).bind(...w.params),
  ]);
  return {
    items: ((items?.results ?? []) as RawScanRow[]).map(toScanRow),
    total: ((total?.results?.[0] as { total: number } | undefined)?.total ?? 0),
  };
}

/** Paginação por keyset (ts, id) — estável e sem OFFSET crescente, para exportação. */
export async function scansAfter(
  db: Database,
  f: ScanFilter,
  cursor: { ts: string; id: number } | null,
  limit: number,
): Promise<ScanRowDTO[]> {
  const w = where(f);
  const keyset = cursor ? ' AND (s.ts < ? OR (s.ts = ? AND s.id < ?))' : '';
  const params = cursor ? [...w.params, cursor.ts, cursor.ts, cursor.id] : w.params;
  const { results } = await db
    .prepare(
      `SELECT ${SCAN_ROW_SQL} FROM scans s JOIN links l ON l.id = s.link_id
       WHERE ${w.sql}${keyset} ORDER BY s.ts DESC, s.id DESC LIMIT ?`,
    )
    .bind(...params, limit)
    .all<RawScanRow>();
  return results.map(toScanRow);
}
