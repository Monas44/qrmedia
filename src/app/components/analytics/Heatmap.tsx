import { useMemo, useState } from 'react';
import type { StatsDTO } from '@shared/types';
import { fmtInt } from '../../lib/format';
import { chartColors, useTheme } from '../../lib/theme';
import { Card } from '../ui';

// Semana começando na segunda; dow do SQLite: 0 = domingo.
const ROWS = [
  { dow: 1, label: 'Seg', long: 'segunda' },
  { dow: 2, label: 'Ter', long: 'terça' },
  { dow: 3, label: 'Qua', long: 'quarta' },
  { dow: 4, label: 'Qui', long: 'quinta' },
  { dow: 5, label: 'Sex', long: 'sexta' },
  { dow: 6, label: 'Sáb', long: 'sábado' },
  { dow: 0, label: 'Dom', long: 'domingo' },
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function Heatmap({ cells }: { cells: StatsDTO['heatmap'] }) {
  const { dark } = useTheme();
  const { ramp } = chartColors(dark);
  const [hover, setHover] = useState<{ dow: number; hour: number; count: number } | null>(null);

  const { grid, max } = useMemo(() => {
    const g = new Map<string, number>();
    let m = 0;
    for (const c of cells) {
      g.set(`${c.dow}:${c.hour}`, c.count);
      m = Math.max(m, c.count);
    }
    return { grid: g, max: m };
  }, [cells]);

  // Zero = passo neutro; demais valores em 7 faixas da rampa sequencial azul.
  const color = (n: number) => (n === 0 || max === 0 ? ramp[0] : ramp[Math.min(7, 1 + Math.floor((n / max) * 6.999))]);
  const rowLong = (dow: number) => ROWS.find((r) => r.dow === dow)?.long ?? '';

  return (
    <Card
      title="Dia da semana × hora"
      actions={
        <span className="text-xs text-muted" aria-live="polite">
          {hover
            ? `${rowLong(hover.dow)}, ${String(hover.hour).padStart(2, '0')}h–${String(hover.hour + 1).padStart(2, '0')}h: ${fmtInt(hover.count)} scans`
            : 'Horário de Brasília'}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <div className="grid min-w-[300px] gap-[2px]" style={{ gridTemplateColumns: '32px repeat(24, minmax(10px, 1fr))' }} onMouseLeave={() => setHover(null)}>
          {ROWS.map((row) => (
            <div key={row.dow} className="contents">
              <div className="flex items-center text-xs text-muted">{row.label}</div>
              {HOURS.map((hour) => {
                const count = grid.get(`${row.dow}:${hour}`) ?? 0;
                return (
                  <div
                    key={hour}
                    role="img"
                    aria-label={`${row.long}, ${hour}h: ${count} scans`}
                    title={`${row.long}, ${hour}h: ${fmtInt(count)} scans`}
                    onMouseEnter={() => setHover({ dow: row.dow, hour, count })}
                    className="aspect-square rounded-[3px] hover:outline-2 hover:outline-offset-1 hover:outline-[var(--ink)]"
                    style={{ background: color(count) }}
                  />
                );
              })}
            </div>
          ))}
          <div />
          {HOURS.map((h) => (
            <div key={h} className="tabular pt-1 text-center text-[10px] text-muted">
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
        <span>menos</span>
        <div className="flex gap-[2px]">
          {ramp.map((c) => (
            <span key={c} className="size-3 rounded-[2px]" style={{ background: c }} />
          ))}
        </div>
        <span>mais{max > 0 ? ` (${fmtInt(max)})` : ''}</span>
      </div>
    </Card>
  );
}
