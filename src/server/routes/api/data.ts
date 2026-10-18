import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { ImportResultDTO, SettingsDTO } from '../../../shared/types';
import type { AppEnv } from '../../env';
import { AppError, ok, readJson } from '../../lib/http';
import { clearScans, importScansCsv, insertManualScans, MANUAL_MAX_COUNT } from '../../services/scan-admin';

const settingsSchema = z.object({ analytics_paused: z.boolean() });

const manualSchema = z.object({
  link_id: z.number().int().positive(),
  ts: z.string().min(1).max(40),
  count: z.number().int().min(1).max(MANUAL_MAX_COUNT),
  device_type: z.enum(['mobile', 'tablet', 'desktop']).nullable().optional(),
  os: z.string().max(64).nullable().optional(),
  browser: z.string().max(64).nullable().optional(),
  language: z.string().max(35).nullable().optional(),
  referrer: z.string().max(255).nullable().optional(),
});

const importSchema = z.object({
  csv: z.string().min(1, 'Arquivo vazio.'),
  link_id: z.number().int().positive().nullable().optional(),
});

const clearSchema = z.object({
  link_id: z.number().int().positive().nullable().optional(),
  from: z.string().max(40).nullable().optional(),
  to: z.string().max(40).nullable().optional(),
  only: z.enum(['all', 'imported']),
  confirm: z.string(),
});

const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export const dataRoutes = new Hono<AppEnv>()
  .get('/settings', (c) => ok<SettingsDTO>(c, { analytics_paused: c.env.settings.analyticsPaused }))
  .patch('/settings', async (c) => {
    const { analytics_paused } = settingsSchema.parse(await readJson(c));
    await c.env.settings.setAnalyticsPaused(c.env.DB, analytics_paused);
    return ok<SettingsDTO>(c, { analytics_paused });
  })
  .post('/scans/manual', async (c) => {
    const inserted = await insertManualScans(c.env.DB, manualSchema.parse(await readJson(c)));
    return ok(c, { inserted }, 201);
  })
  .post(
    '/scans/import',
    bodyLimit({
      maxSize: IMPORT_MAX_BYTES,
      onError: () => {
        throw new AppError(413, 'file_too_large', 'Arquivo grande demais (máx. 10 MB). Divida o CSV.');
      },
    }),
    async (c) => {
      const { csv, link_id } = importSchema.parse(await readJson(c));
      const result = await importScansCsv(c.env.DB, csv, link_id ?? null);
      return ok<ImportResultDTO>(c, result, result.errors.length ? 422 : 201);
    },
  )
  .post('/scans/clear', async (c) => {
    const deleted = await clearScans(c.env.DB, clearSchema.parse(await readJson(c)));
    return ok(c, { deleted });
  });
