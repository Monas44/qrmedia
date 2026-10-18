import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Paginated, ScanRowDTO } from '../../../shared/types';
import type { AppEnv } from '../../env';
import { notFound, ok } from '../../lib/http';
import { localDay, parsePeriod } from '../../lib/period';
import { isTruthy, parseId } from '../../lib/request';
import { findLinkById } from '../../repositories/links-repo';
import { listScans } from '../../repositories/stats-repo';
import { buildStats, scansCsvStream, toFilter } from '../../services/stats-service';

const scopeSchema = z.object({
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  bots: z.string().optional(),
  link_id: z.string().optional(),
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(25),
});

async function resolveScope(c: Context<AppEnv>, linkIdParam?: string) {
  const q = scopeSchema.parse(c.req.query());
  const rawLinkId = linkIdParam ?? q.link_id;
  const linkId = rawLinkId ? parseId(rawLinkId, 'link_id') : null;
  if (linkId !== null && !(await findLinkById(c.env.DB, linkId))) throw notFound('Link');
  return { period: parsePeriod(q.from, q.to), linkId, includeBots: isTruthy(q.bots) };
}

async function statsHandler(c: Context<AppEnv>, linkIdParam?: string) {
  const { period, linkId, includeBots } = await resolveScope(c, linkIdParam);
  return ok(c, await buildStats(c.env.DB, period, linkId, includeBots));
}

async function scansHandler(c: Context<AppEnv>, linkIdParam?: string) {
  const { period, linkId, includeBots } = await resolveScope(c, linkIdParam);
  const { page, page_size } = pageSchema.parse(c.req.query());
  const result = await listScans(c.env.DB, toFilter(period, linkId, includeBots), page, page_size);
  return ok<Paginated<ScanRowDTO>>(c, { items: result.items, total: result.total, page, page_size });
}

async function csvHandler(c: Context<AppEnv>, linkIdParam?: string) {
  const { period, linkId, includeBots } = await resolveScope(c, linkIdParam);
  const name = `scans-${linkId ?? 'todos'}-${localDay(period.from)}_${localDay(new Date(period.to.getTime() - 1))}.csv`;
  return new Response(scansCsvStream(c.env.DB, toFilter(period, linkId, includeBots)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const statsRoutes = new Hono<AppEnv>()
  // Analytics geral (opcionalmente filtrado por ?link_id=)
  .get('/stats', (c) => statsHandler(c))
  .get('/scans', (c) => scansHandler(c))
  .get('/scans/export', (c) => csvHandler(c))
  // Por link
  .get('/links/:id{[0-9]+}/stats', (c) => statsHandler(c, c.req.param('id')))
  .get('/links/:id{[0-9]+}/scans', (c) => scansHandler(c, c.req.param('id')))
  .get('/links/:id{[0-9]+}/scans/export', (c) => csvHandler(c, c.req.param('id')));
