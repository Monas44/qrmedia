export const TIMEZONE = 'America/Sao_Paulo';

const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number) => nf.format(n);
export const fmtDec = (n: number) => nf1.format(n);
export const fmtCompact = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : nf.format(n));

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short' });
const weekdayLong = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' });

export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
const dateTimeSec = new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'medium' });
/** "18/10/2026, 14:30:15" no horário de Brasília. */
export const fmtDateTimeSec = (iso: string) => dateTimeSec.format(new Date(iso));
/** Formata um dia "YYYY-MM-DD" (já local) sem conversão de fuso. */
export const fmtDay = (day: string) => dateOnly.format(new Date(`${day}T12:00:00Z`));
export const fmtDayShort = (day: string) => dayMonth.format(new Date(`${day}T12:00:00Z`)).replace('.', '');
export const fmtDayLong = (day: string) => weekdayLong.format(new Date(`${day}T12:00:00Z`));

let languageNames: Intl.DisplayNames | null = null;
try {
  languageNames = new Intl.DisplayNames(['pt-BR'], { type: 'language' });
} catch {
  // navegador sem Intl.DisplayNames: mostra o código
}

export function languageName(code: string | null): string {
  if (!code) return 'Não informado';
  try {
    const name = languageNames?.of(code);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}

export const DEVICE_LABELS: Record<string, string> = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computador' };
export const deviceLabel = (d: string | null) => (d ? (DEVICE_LABELS[d] ?? d) : 'Desconhecido');

export const orUnknown = (v: string | null, fallback = 'Desconhecido') => v || fallback;

export function relativeTime(iso: string | null): string {
  if (!iso) return 'nunca';
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return fmtDateTime(iso).split(' ')[0] ?? '';
}
