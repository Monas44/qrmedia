import { TIMEZONE } from './format';

export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface PeriodValue {
  preset: PeriodPreset;
  from: string; // YYYY-MM-DD (São Paulo)
  to: string; // YYYY-MM-DD inclusivo
}

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  custom: 'Personalizado',
};

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export const todayLocal = () => ymd.format(new Date());

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>): PeriodValue {
  const today = todayLocal();
  const back = { today: 0, '7d': 6, '30d': 29, '90d': 89 }[preset];
  return { preset, from: addDays(today, -back), to: today };
}
