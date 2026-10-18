import type { ClearScansInput, ImportResultDTO, ManualScansInput, ScanSource } from '../../shared/types';
import type { Database, SqlValue, Statement } from '../db';
import { normalizeHeader, parseCsv } from '../lib/csv';
import { randomHex, sha256Hex } from '../lib/crypto';
import { AppError } from '../lib/http';
import { parseAccessTime, parsePeriod } from '../lib/period';
import { referrerHost } from '../lib/url';
import { findLinkById } from '../repositories/links-repo';

export const IMPORT_MAX_ROWS = 20_000;
export const IMPORT_MAX_SCANS = 100_000;
export const MANUAL_MAX_COUNT = 1_000;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const MIN_DATE = Date.UTC(2000, 0, 1);

const DEVICE_ALIASES: Record<string, 'mobile' | 'tablet' | 'desktop'> = {
  mobile: 'mobile', celular: 'mobile', smartphone: 'mobile', telefone: 'mobile',
  tablet: 'tablet',
  desktop: 'desktop', computador: 'desktop', pc: 'desktop', notebook: 'desktop',
};

interface ScanValues {
  link_id: number;
  ts: string;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  language: string | null;
  visitor_hash: string;
  is_bot: number;
  source: ScanSource;
}

const INSERT_SQL = `INSERT INTO scans (link_id, ts, device_type, os, browser, referrer, language, visitor_hash, is_bot, source)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`;

async function insertMany(db: Database, rows: ScanValues[]): Promise<void> {
  const stmt = db.prepare(INSERT_SQL);
  const statements: Statement[] = rows.map((r) =>
    stmt.bind(r.link_id, r.ts, r.device_type, r.os, r.browser, r.referrer, r.language, r.visitor_hash, r.is_bot, r.source),
  );
  await db.batch(statements); // uma transação: ou entra tudo, ou nada
}

const text = (v: string | undefined | null, max: number) => (v?.trim() ? v.trim().slice(0, max) : null);

function checkTime(raw: string): { date: Date } | { error: string } {
  const date = parseAccessTime(raw);
  if (!date) return { error: `Data/hora inválida: "${raw}". Use "18/10/2026 14:30" ou "2026-10-18 14:30" (horário de Brasília).` };
  if (date.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return { error: `Data/hora no futuro: "${raw}".` };
  if (date.getTime() < MIN_DATE) return { error: `Data/hora muito antiga: "${raw}".` };
  return { date };
}

function parseDevice(raw: string | undefined): { value: string | null } | { error: string } {
  if (!raw?.trim()) return { value: null };
  const key = normalizeHeader(raw);
  const value = DEVICE_ALIASES[key];
  return value ? { value } : { error: `Dispositivo desconhecido: "${raw}". Use celular, tablet ou computador.` };
}

// ---------- lançamento manual ----------

export async function insertManualScans(db: Database, input: ManualScansInput): Promise<number> {
  if (!(await findLinkById(db, input.link_id))) throw new AppError(404, 'not_found', 'Link não encontrado.');
  const time = checkTime(input.ts);
  if ('error' in time) throw new AppError(400, 'invalid_time', time.error);
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MANUAL_MAX_COUNT) {
    throw new AppError(400, 'invalid_count', `A quantidade deve ser entre 1 e ${MANUAL_MAX_COUNT}.`);
  }

  const ts = time.date.toISOString();
  const rows: ScanValues[] = Array.from({ length: input.count }, () => ({
    link_id: input.link_id,
    ts,
    device_type: input.device_type ?? null,
    os: text(input.os, 64),
    browser: text(input.browser, 64),
    referrer: input.referrer ? (referrerHost(input.referrer) ?? text(input.referrer, 255)) : null,
    language: text(input.language, 35),
    visitor_hash: randomHex(32), // cada acesso lançado conta como um visitante
    is_bot: 0,
    source: 'manual',
  }));
  await insertMany(db, rows);
  return rows.length;
}

// ---------- importação de CSV ----------

const COLUMN_ALIASES = {
  ts: ['ts', 'data_hora', 'datahora', 'data_e_hora', 'timestamp', 'datetime', 'acesso'],
  ts_local: ['ts_local'],
  date: ['data', 'dia', 'date'],
  time: ['hora', 'horario', 'time'],
  slug: ['slug', 'link'],
  device: ['device_type', 'dispositivo', 'device'],
  os: ['os', 'sistema', 'sistema_operacional'],
  browser: ['browser', 'navegador'],
  referrer: ['referrer', 'origem', 'referer'],
  language: ['language', 'idioma'],
  bot: ['is_bot', 'bot'],
  count: ['quantidade', 'qtd', 'count', 'acessos'],
  visitor: ['visitante', 'visitor', 'visitor_id'],
} satisfies Record<string, string[]>;
type ColumnKey = keyof typeof COLUMN_ALIASES;

export async function importScansCsv(db: Database, csv: string, linkId: number | null): Promise<ImportResultDTO> {
  const table = parseCsv(csv);
  if (table.length < 2) throw new AppError(400, 'empty_csv', 'O CSV precisa de um cabeçalho e pelo menos uma linha.');
  const [header, ...rows] = table;
  if (rows.length > IMPORT_MAX_ROWS) throw new AppError(400, 'too_many_rows', `Máximo de ${IMPORT_MAX_ROWS} linhas por importação.`);

  const names = header!.map(normalizeHeader);
  const col = (key: ColumnKey) => names.findIndex((n) => (COLUMN_ALIASES[key] as string[]).includes(n));
  const idx = Object.fromEntries((Object.keys(COLUMN_ALIASES) as ColumnKey[]).map((k) => [k, col(k)])) as Record<ColumnKey, number>;

  if (idx.ts < 0 && idx.ts_local < 0 && (idx.date < 0 || idx.time < 0)) {
    throw new AppError(400, 'missing_time_column', 'O CSV precisa da coluna "data_hora" (ou "data" e "hora", ou "ts" da exportação).');
  }
  if (linkId === null && idx.slug < 0) {
    throw new AppError(400, 'missing_slug_column', 'Inclua a coluna "slug" ou importe a partir da página do link.');
  }
  if (linkId !== null && !(await findLinkById(db, linkId))) throw new AppError(404, 'not_found', 'Link não encontrado.');

  // Slugs → ids (uma consulta só).
  const slugIds = new Map<string, number>();
  if (idx.slug >= 0) {
    const { results } = await db.prepare('SELECT id, slug FROM links').all<{ id: number; slug: string }>();
    for (const r of results) slugIds.set(r.slug, r.id);
  }

  const errors: ImportResultDTO['errors'] = [];
  const out: ScanValues[] = [];
  const cell = (row: string[], i: number) => (i >= 0 ? row[i] : undefined);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const line = r + 2; // linha no arquivo (1 = cabeçalho)
    const fail = (message: string) => errors.push({ line, message });

    // Data/hora: "ts" (ISO da exportação), "ts_local", ou "data" + "hora".
    const rawTime =
      cell(row, idx.ts) || cell(row, idx.ts_local) || [cell(row, idx.date), cell(row, idx.time)].filter(Boolean).join(' ');
    if (!rawTime) {
      fail('Data/hora vazia.');
      continue;
    }
    const time = checkTime(rawTime);
    if ('error' in time) {
      fail(time.error);
      continue;
    }

    let rowLink = linkId;
    const slug = cell(row, idx.slug)?.toLowerCase().replace(/^.*\//, ''); // aceita a URL curta inteira
    if (slug) {
      const id = slugIds.get(slug);
      if (id === undefined) {
        fail(`Link "${slug}" não existe. Crie o link antes de importar.`);
        continue;
      }
      if (linkId !== null && id !== linkId) {
        fail(`Linha do link "${slug}", mas a importação é para outro link.`);
        continue;
      }
      rowLink = id;
    }
    if (rowLink === null) {
      fail('Slug vazio.');
      continue;
    }

    const device = parseDevice(cell(row, idx.device));
    if ('error' in device) {
      fail(device.error);
      continue;
    }

    const rawCount = cell(row, idx.count);
    const count = rawCount ? Number(rawCount) : 1;
    if (!Number.isInteger(count) || count < 1 || count > MANUAL_MAX_COUNT) {
      fail(`Quantidade inválida: "${rawCount}" (1 a ${MANUAL_MAX_COUNT}).`);
      continue;
    }

    const bot = cell(row, idx.bot)?.toLowerCase();
    const visitor = cell(row, idx.visitor);
    const visitorHash = visitor ? await sha256Hex(`import|${visitor}`) : null;
    for (let k = 0; k < count; k++) {
      out.push({
        link_id: rowLink,
        ts: time.date.toISOString(),
        device_type: device.value,
        os: text(cell(row, idx.os), 64),
        browser: text(cell(row, idx.browser), 64),
        referrer: text(cell(row, idx.referrer), 255),
        language: text(cell(row, idx.language), 35),
        visitor_hash: visitorHash ?? randomHex(32),
        is_bot: bot === '1' || bot === 'true' || bot === 'sim' ? 1 : 0,
        source: 'import',
      });
    }
    if (out.length > IMPORT_MAX_SCANS) {
      throw new AppError(400, 'too_many_scans', `A importação passaria de ${IMPORT_MAX_SCANS} acessos. Divida o arquivo.`);
    }
  }

  // Tudo ou nada: com qualquer erro, nada é gravado.
  if (errors.length > 0) return { imported: 0, rows: rows.length, errors: errors.slice(0, 50) };
  await insertMany(db, out);
  return { imported: out.length, rows: rows.length, errors: [] };
}

// ---------- limpeza ----------

export async function clearScans(db: Database, input: ClearScansInput): Promise<number> {
  if (input.confirm !== 'APAGAR') throw new AppError(400, 'confirmation_required', 'Digite APAGAR para confirmar.');
  const linkId = input.link_id ?? null;
  if (linkId !== null && !(await findLinkById(db, linkId))) throw new AppError(404, 'not_found', 'Link não encontrado.');

  const parts: string[] = [];
  const params: SqlValue[] = [];
  if (linkId !== null) {
    parts.push('link_id = ?');
    params.push(linkId);
  }
  if (input.from || input.to) {
    const period = parsePeriod(input.from, input.to);
    parts.push('ts >= ?', 'ts < ?');
    params.push(period.from.toISOString(), period.to.toISOString());
  }
  if (input.only === 'imported') parts.push("source <> 'qr'");

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  const { changes } = await db.prepare(`DELETE FROM scans ${where}`).bind(...params).run();
  return changes;
}
