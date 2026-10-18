import type { Database, Statement } from '../db';
import type { LinkHistoryDTO, LinkSortField } from '../../shared/types';

export interface LinkRow {
  id: number;
  slug: string;
  destination_url: string;
  title: string | null;
  tags: string; // JSON
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_active: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkListRow extends LinkRow {
  total_scans: number;
  scans_24h: number;
  last_scan_at: string | null;
}

export type NewLink = Omit<LinkRow, 'id'>;
export type LinkChanges = Partial<Omit<LinkRow, 'id' | 'slug' | 'created_at'>>;

const COLUMNS =
  'id, slug, destination_url, title, tags, utm_source, utm_medium, utm_campaign, is_active, expires_at, created_at, updated_at';

export function findLinkBySlug(db: Database, slug: string) {
  return db.prepare(`SELECT ${COLUMNS} FROM links WHERE slug = ?1`).bind(slug).first<LinkRow>();
}

export function findLinkById(db: Database, id: number) {
  return db.prepare(`SELECT ${COLUMNS} FROM links WHERE id = ?1`).bind(id).first<LinkRow>();
}

export interface ListLinksQuery {
  search?: string;
  tag?: string;
  sort: LinkSortField;
  order: 'asc' | 'desc';
  since24h: string;
}

const SORT_SQL: Record<LinkSortField, string> = {
  created_at: 'l.created_at',
  updated_at: 'l.updated_at',
  title: "COALESCE(l.title, l.slug) COLLATE NOCASE",
  slug: 'l.slug',
  total_scans: 'total_scans',
  scans_24h: 'scans_24h',
};

export async function listLinks(db: Database, q: ListLinksQuery): Promise<LinkListRow[]> {
  const search = q.search ? `%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  // Contagens por subquery correlacionada: cada uma é um range scan no índice
  // idx_scans_link_ts (link_id, ts, is_bot), sem tocar nas linhas da tabela.
  const sql = `
    SELECT l.*,
      (SELECT COUNT(*) FROM scans s WHERE s.link_id = l.id AND s.is_bot = 0) AS total_scans,
      (SELECT COUNT(*) FROM scans s WHERE s.link_id = l.id AND s.ts >= ?1 AND s.is_bot = 0) AS scans_24h,
      (SELECT MAX(s.ts) FROM scans s WHERE s.link_id = l.id AND s.is_bot = 0) AS last_scan_at
    FROM links l
    WHERE (?2 IS NULL OR l.slug LIKE ?2 ESCAPE '\\' OR l.title LIKE ?2 ESCAPE '\\' OR l.destination_url LIKE ?2 ESCAPE '\\')
      AND (?3 IS NULL OR EXISTS (SELECT 1 FROM json_each(l.tags) WHERE json_each.value = ?3))
    ORDER BY ${SORT_SQL[q.sort]} ${q.order === 'asc' ? 'ASC' : 'DESC'}, l.id DESC
    LIMIT 1000`;
  const { results } = await db.prepare(sql).bind(q.since24h, search, q.tag ?? null).all<LinkListRow>();
  return results;
}

export async function listTags(db: Database): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT DISTINCT json_each.value AS tag FROM links, json_each(links.tags) ORDER BY tag COLLATE NOCASE')
    .all<{ tag: string }>();
  return results.map((r) => r.tag);
}

export async function insertLink(db: Database, link: NewLink): Promise<LinkRow> {
  const row = await db
    .prepare(
      `INSERT INTO links (slug, destination_url, title, tags, utm_source, utm_medium, utm_campaign, is_active, expires_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       RETURNING ${COLUMNS}`,
    )
    .bind(
      link.slug, link.destination_url, link.title, link.tags, link.utm_source, link.utm_medium,
      link.utm_campaign, link.is_active, link.expires_at, link.created_at, link.updated_at,
    )
    .first<LinkRow>();
  if (!row) throw new Error('insert_link_failed');
  return row;
}

/** Atualiza o link e, se o destino mudou, grava o histórico na mesma transação. */
export async function updateLink(
  db: Database,
  current: LinkRow,
  changes: LinkChanges,
): Promise<LinkRow> {
  const entries = Object.entries(changes).filter(([, v]) => v !== undefined);
  const sets = entries.map(([k], i) => `${k} = ?${i + 2}`).join(', ');
  const update = db
    .prepare(`UPDATE links SET ${sets} WHERE id = ?1 RETURNING ${COLUMNS}`)
    .bind(current.id, ...entries.map(([, v]) => v));

  const statements: Statement[] = [update];
  if (changes.destination_url && changes.destination_url !== current.destination_url) {
    statements.push(
      db
        .prepare('INSERT INTO link_history (link_id, old_url, new_url, changed_at) VALUES (?1, ?2, ?3, ?4)')
        .bind(current.id, current.destination_url, changes.destination_url, changes.updated_at ?? new Date().toISOString()),
    );
  }
  const [result] = await db.batch<LinkRow>(statements);
  const row = result?.results[0];
  if (!row) throw new Error('update_link_failed');
  return row;
}

export async function deleteLink(db: Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM links WHERE id = ?1').bind(id).run();
}

export async function listHistory(db: Database, linkId: number): Promise<LinkHistoryDTO[]> {
  const { results } = await db
    .prepare('SELECT id, old_url, new_url, changed_at FROM link_history WHERE link_id = ?1 ORDER BY changed_at DESC, id DESC LIMIT 100')
    .bind(linkId)
    .all<LinkHistoryDTO>();
  return results;
}
