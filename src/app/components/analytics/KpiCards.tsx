import type { StatsDTO } from '@shared/types';
import { fmtDayShort, fmtDec, fmtInt } from '../../lib/format';
import { cx, Icon } from '../ui';

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted">sem dados no período anterior</span>;
  if (value === 0) return <span className="text-xs text-muted">= igual ao período anterior</span>;
  const up = value > 0;
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-medium', up ? 'text-good' : 'text-bad')}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} className="size-3.5" />
      {up ? '+' : '−'}
      {fmtDec(Math.abs(value))}%<span className="font-normal text-muted">vs anterior</span>
    </span>
  );
}

function Tile({ label, value, sub, change }: { label: string; value: string; sub?: string; change: number | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-ink sm:text-3xl">{value}</span>
        {sub && <span className="truncate text-sm text-muted">{sub}</span>}
      </div>
      <div className="mt-2">
        <Delta value={change} />
      </div>
    </div>
  );
}

export function KpiCards({ stats }: { stats: StatsDTO }) {
  const { kpis, change } = stats;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Total de scans" value={fmtInt(kpis.total)} change={change.total} />
      <Tile label="Visitantes únicos" value={fmtInt(kpis.unique_visitors)} change={change.unique_visitors} />
      <Tile label="Média diária" value={fmtDec(kpis.daily_average)} change={change.daily_average} />
      <Tile
        label="Pico diário"
        value={fmtInt(kpis.peak_day?.count ?? 0)}
        sub={kpis.peak_day ? fmtDayShort(kpis.peak_day.day) : undefined}
        change={change.peak_day}
      />
    </div>
  );
}
