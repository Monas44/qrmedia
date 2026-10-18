import type { LinkDTO, LinkInput, LinkListItemDTO, LinkPatch } from '../../shared/types';
import type { Env } from '../env';
import { AppError } from '../lib/http';
import { generateSlug, isValidCustomSlug } from '../lib/slug';
import { buildFinalUrl, normalizeDestination } from '../lib/url';
import {
  findLinkById,
  findLinkBySlug,
  insertLink,
  updateLink,
  type LinkChanges,
  type LinkListRow,
  type LinkRow,
} from '../repositories/links-repo';
import type { RedirectRecord } from './redirect-cache';

export function toRedirectRecord(row: LinkRow): RedirectRecord {
  return {
    id: row.id,
    url: buildFinalUrl(row.destination_url, row),
    active: row.is_active === 1,
    expires_at: row.expires_at,
  };
}

export function toLinkDTO(row: LinkRow, baseUrl: string): LinkDTO {
  return {
    id: row.id,
    slug: row.slug,
    short_url: `${baseUrl}/${row.slug}`,
    destination_url: row.destination_url,
    final_url: buildFinalUrl(row.destination_url, row),
    title: row.title,
    tags: parseTags(row.tags),
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.utm_campaign,
    is_active: row.is_active === 1,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toLinkListItemDTO(row: LinkListRow, baseUrl: string): LinkListItemDTO {
  return { ...toLinkDTO(row, baseUrl), total_scans: row.total_scans, scans_24h: row.scans_24h, last_scan_at: row.last_scan_at };
}

function parseTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: string[] | undefined): string {
  const clean = [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  return JSON.stringify(clean);
}

const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

function requireDestination(url: string): string {
  const normalized = normalizeDestination(url);
  if (!normalized) {
    throw new AppError(400, 'invalid_destination', 'URL de destino inválida. Use uma URL completa começando com http:// ou https://.');
  }
  return normalized;
}

function normalizeExpiry(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new AppError(400, 'invalid_expiry', 'Data de expiração inválida.');
  return new Date(ms).toISOString();
}

export async function syncRedirectCache(env: Env, row: LinkRow): Promise<void> {
  env.cache.set(row.slug, toRedirectRecord(row));
}

export async function removeRedirectCache(env: Env, slug: string): Promise<void> {
  env.cache.delete(slug);
}

/** Caminho quente do redirect: cache em memória; se faltar, banco e repopula o cache. */
export async function resolveSlug(env: Env, slug: string): Promise<RedirectRecord | null> {
  const cached = env.cache.get(slug);
  if (cached) return cached;

  const row = await findLinkBySlug(env.DB, slug);
  if (!row) return null;
  const record = toRedirectRecord(row);
  env.cache.set(slug, record);
  return record;
}

export async function createLink(env: Env, input: LinkInput): Promise<LinkRow> {
  const destination = requireDestination(input.destination_url);
  const now = new Date().toISOString();
  const base = {
    destination_url: destination,
    title: emptyToNull(input.title) ?? null,
    tags: normalizeTags(input.tags),
    utm_source: emptyToNull(input.utm_source) ?? null,
    utm_medium: emptyToNull(input.utm_medium) ?? null,
    utm_campaign: emptyToNull(input.utm_campaign) ?? null,
    is_active: input.is_active === false ? 0 : 1,
    expires_at: normalizeExpiry(input.expires_at) ?? null,
    created_at: now,
    updated_at: now,
  };

  const custom = input.slug?.trim().toLowerCase();
  if (custom) {
    if (!isValidCustomSlug(custom)) {
      throw new AppError(400, 'invalid_slug', 'Slug inválido. Use 3 a 64 caracteres: letras minúsculas, números, - ou _.');
    }
    if (await findLinkBySlug(env.DB, custom)) throw new AppError(409, 'slug_taken', 'Este slug já está em uso.');
    const row = await insertLink(env.DB, { ...base, slug: custom });
    await syncRedirectCache(env, row);
    return row;
  }

  // Slug gerado: ~887 milhões de combinações; colisão é rara, mas tratada.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    try {
      const row = await insertLink(env.DB, { ...base, slug });
      await syncRedirectCache(env, row);
      return row;
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
    }
  }
  throw new AppError(500, 'slug_generation_failed', 'Não foi possível gerar um slug único. Tente novamente.');
}

export async function patchLink(env: Env, id: number, patch: LinkPatch): Promise<LinkRow> {
  const current = await findLinkById(env.DB, id);
  if (!current) throw new AppError(404, 'not_found', 'Link não encontrado.');

  const changes: LinkChanges = {
    destination_url: patch.destination_url === undefined ? undefined : requireDestination(patch.destination_url),
    title: emptyToNull(patch.title),
    tags: patch.tags === undefined ? undefined : normalizeTags(patch.tags),
    utm_source: emptyToNull(patch.utm_source),
    utm_medium: emptyToNull(patch.utm_medium),
    utm_campaign: emptyToNull(patch.utm_campaign),
    is_active: patch.is_active === undefined ? undefined : patch.is_active ? 1 : 0,
    expires_at: normalizeExpiry(patch.expires_at),
    updated_at: new Date().toISOString(),
  };

  const row = await updateLink(env.DB, current, changes);
  await syncRedirectCache(env, row);
  return row;
}
