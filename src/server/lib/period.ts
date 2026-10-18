import { AppError } from './http';

/**
 * America/Sao_Paulo não tem horário de verão desde 2019, então o offset é fixo
 * em UTC−3. Isso permite agrupar em SQL com um simples modificador de data.
 */
export const APP_TIMEZONE = 'America/Sao_Paulo';
export const TZ_OFFSET_HOURS = -3;
export const SQL_TZ_MODIFIER = `${TZ_OFFSET_HOURS} hours`;

const DAY_MS = 86_400_000;
const OFFSET_MS = TZ_OFFSET_HOURS * 3_600_000;
const MAX_RANGE_DAYS = 400;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface Period {
  from: Date;
  to: Date; // exclusivo
  prevFrom: Date;
  prevTo: Date;
  days: number;
}

/** Data local (São Paulo) no formato YYYY-MM-DD. */
export function localDay(date: Date): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Meia-noite de São Paulo do dia informado, em UTC. */
export function startOfLocalDay(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - OFFSET_MS);
}

function parseBound(value: string, isEnd: boolean): Date {
  if (DATE_ONLY_RE.test(value)) {
    const start = startOfLocalDay(value);
    if (Number.isNaN(start.getTime())) throw invalid();
    // `to` como data é inclusivo para quem chama: vai até o fim daquele dia.
    return isEnd ? new Date(start.getTime() + DAY_MS) : start;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw invalid();
  return new Date(ms);
}

const invalid = () =>
  new AppError(400, 'invalid_period', 'Período inválido. Use datas YYYY-MM-DD ou ISO 8601 em `from` e `to`.');

/**
 * `from`/`to` aceitam YYYY-MM-DD (dia local de São Paulo; `to` inclusivo) ou ISO 8601.
 * Padrão: últimos 30 dias. O período anterior tem a mesma duração e termina em `from`.
 */
export function parsePeriod(fromRaw?: string | null, toRaw?: string | null, now = new Date()): Period {
  const to = toRaw ? parseBound(toRaw, true) : now;
  const from = fromRaw ? parseBound(fromRaw, false) : new Date(startOfLocalDay(localDay(now)).getTime() - 29 * DAY_MS);
  const span = to.getTime() - from.getTime();
  if (span <= 0) throw new AppError(400, 'invalid_period', '`from` deve ser anterior a `to`.');
  if (span > MAX_RANGE_DAYS * DAY_MS) {
    throw new AppError(400, 'invalid_period', `O período máximo é de ${MAX_RANGE_DAYS} dias.`);
  }
  return {
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    days: Math.max(1, Math.ceil(span / DAY_MS)),
  };
}

/** Lista os dias locais cobertos por [from, to). */
export function eachLocalDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  let cursor = startOfLocalDay(localDay(from));
  while (cursor < to) {
    days.push(localDay(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return days;
}
