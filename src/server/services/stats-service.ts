import type { Kpis, ScanRowDTO, StatsDTO } from '../../shared/types';
import { APP_TIMEZONE, eachLocalDay, TZ_OFFSET_HOURS, type Period } from '../lib/period';
import type { Database } from '../db';
import { aggregateStats, scansAfter, type ScanFilter } from '../repositories/stats-repo';

const round1 = (n: number) => Math.round(n * 10) / 10;

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / previous) * 100);
}

export function toFilter(period: Period, linkId: number | null, includeBots: boolean): ScanFilter {
  return { from: period.from.toISOString(), to: period.to.toISOString(), linkId, includeBots };
}

export async function buildStats(db: Database, period: Period, linkId: number | null, includeBots: boolean): Promise<StatsDTO> {
  const filter = toFilter(period, linkId, includeBots);
  const prevFilter: ScanFilter = { ...filter, from: period.prevFrom.toISOString(), to: period.prevTo.toISOString() };
  const raw = await aggregateStats(db, filter, prevFilter);

  // Série contínua: dias sem scans aparecem com zero.
  const byDay = new Map(raw.daily.map((d) => [d.day, d]));
  const daily = eachLocalDay(period.from, period.to).map((day) => byDay.get(day) ?? { day, count: 0, unique: 0 });

  const peak = raw.daily.reduce<{ day: string; count: number } | null>(
    (best, d) => (!best || d.count > best.count ? { day: d.day, count: d.count } : best),
    null,
  );

  const kpis: Kpis = {
    total: raw.totals.total,
    unique_visitors: raw.totals.unique_visitors,
    daily_average: round1(raw.totals.total / period.days),
    peak_day: peak,
  };
  const previous: Kpis = {
    total: raw.prevTotals.total,
    unique_visitors: raw.prevTotals.unique_visitors,
    daily_average: round1(raw.prevTotals.total / period.days),
    peak_day: raw.prevPeak,
  };

  return {
    range: {
      from: filter.from,
      to: filter.to,
      prev_from: prevFilter.from,
      prev_to: prevFilter.to,
      days: period.days,
      timezone: APP_TIMEZONE,
      include_bots: includeBots,
      link_id: linkId,
    },
    kpis,
    previous,
    change: {
      total: pctChange(kpis.total, previous.total),
      unique_visitors: pctChange(kpis.unique_visitors, previous.unique_visitors),
      daily_average: pctChange(kpis.daily_average, previous.daily_average),
      peak_day: pctChange(kpis.peak_day?.count ?? 0, previous.peak_day?.count ?? 0),
    },
    bot_scans: raw.botScans,
    imported_scans: raw.importedScans,
    daily,
    heatmap: raw.heatmap,
    devices: raw.devices,
    os: raw.os,
    browsers: raw.browsers,
    referrers: raw.referrers,
    languages: raw.languages,
    top_links: raw.topLinks,
  };
}

// ---------- CSV ----------

export const CSV_MAX_ROWS = 50_000;
const CSV_CHUNK = 2_000;
const CSV_COLUMNS: (keyof ScanRowDTO | 'ts_local')[] = [
  'ts', 'ts_local', 'slug', 'device_type', 'os', 'browser', 'referrer', 'language', 'is_bot', 'source',
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Neutraliza fórmulas ao abrir no Excel/Sheets (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** "2026-10-17T15:04:05.000Z" → "2026-10-17 12:04:05" (São Paulo). */
function localTimestamp(iso: string): string {
  return new Date(Date.parse(iso) + TZ_OFFSET_HOURS * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/** Gera o CSV em streaming, lendo o banco em blocos por keyset. */
export function scansCsvStream(db: Database, filter: ScanFilter): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cursor: { ts: string; id: number } | null = null;
  let sent = 0;
  let started = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(`﻿${CSV_COLUMNS.join(',')}\n`));
        return;
      }
      const limit = Math.min(CSV_CHUNK, CSV_MAX_ROWS - sent);
      const rows = limit > 0 ? await scansAfter(db, filter, cursor, limit) : [];
      if (rows.length === 0) {
        controller.close();
        return;
      }
      const last = rows[rows.length - 1]!;
      cursor = { ts: last.ts, id: last.id };
      sent += rows.length;
      const lines = rows
        .map((r) =>
          CSV_COLUMNS.map((col) =>
            col === 'ts_local' ? localTimestamp(r.ts) : col === 'is_bot' ? (r.is_bot ? 1 : 0) : csvCell(r[col]),
          ).join(','),
        )
        .join('\n');
      controller.enqueue(encoder.encode(`${lines}\n`));
      if (rows.length < limit) controller.close();
    },
  });
}
