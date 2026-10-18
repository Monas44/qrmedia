import { Hono } from 'hono';
import { z } from 'zod';
import type { LinkDetailDTO, LinkSortField } from '../../../shared/types';
import type { AppEnv } from '../../env';
import { notFound, ok, readJson } from '../../lib/http';
import { parseId, publicBaseUrl } from '../../lib/request';
import { MAX_URL_LENGTH } from '../../lib/url';
import { deleteLink, findLinkById, listHistory, listLinks, listTags } from '../../repositories/links-repo';
import {
  createLink,
  patchLink,
  removeRedirectCache,
  toLinkDTO,
  toLinkListItemDTO,
} from '../../services/link-service';

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const linkFields = {
  destination_url: z.string().min(1, 'Informe a URL de destino.').max(MAX_URL_LENGTH),
  title: optionalText(200),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  utm_source: optionalText(100),
  utm_medium: optionalText(100),
  utm_campaign: optionalText(100),
  is_active: z.boolean().optional(),
  expires_at: z.string().max(40).nullable().optional(),
};

const createSchema = z.object({ ...linkFields, slug: z.string().max(64).optional() });
const patchSchema = z
  .object({ ...linkFields, destination_url: linkFields.destination_url.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nenhum campo para atualizar.');

const SORT_FIELDS = ['created_at', 'updated_at', 'title', 'slug', 'total_scans', 'scans_24h'] as const satisfies readonly LinkSortField[];
const listSchema = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(32).optional(),
  sort: z.enum(SORT_FIELDS).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const linkRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const q = listSchema.parse(c.req.query());
    const rows = await listLinks(c.env.DB, {
      search: q.q?.trim() || undefined,
      tag: q.tag?.trim().toLowerCase() || undefined,
      sort: q.sort,
      order: q.order,
      since24h: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const base = publicBaseUrl(c);
    return ok(c, rows.map((r) => toLinkListItemDTO(r, base)));
  })
  .get('/tags', async (c) => ok(c, await listTags(c.env.DB)))
  .post('/', async (c) => {
    const input = createSchema.parse(await readJson(c));
    const row = await createLink(c.env, input);
    return ok(c, toLinkDTO(row, publicBaseUrl(c)), 201);
  })
  .get('/:id{[0-9]+}', async (c) => {
    const id = parseId(c.req.param('id'));
    const row = await findLinkById(c.env.DB, id);
    if (!row) throw notFound('Link');
    const detail: LinkDetailDTO = { ...toLinkDTO(row, publicBaseUrl(c)), history: await listHistory(c.env.DB, id) };
    return ok(c, detail);
  })
  .patch('/:id{[0-9]+}', async (c) => {
    const id = parseId(c.req.param('id'));
    const patch = patchSchema.parse(await readJson(c));
    const row = await patchLink(c.env, id, patch);
    return ok(c, toLinkDTO(row, publicBaseUrl(c)));
  })
  .delete('/:id{[0-9]+}', async (c) => {
    const id = parseId(c.req.param('id'));
    const row = await findLinkById(c.env.DB, id);
    if (!row) throw notFound('Link');
    await deleteLink(c.env.DB, id);
    await removeRedirectCache(c.env, row.slug);
    return ok(c, { deleted: true });
  });
