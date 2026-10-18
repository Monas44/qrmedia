import { useState } from 'react';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import type { StatsDTO } from '@shared/types';
import { fmtDayLong, fmtDayShort, fmtInt } from '../../lib/format';
import { chartColors, useTheme } from '../../lib/theme';
import { Card, Segmented } from '../ui';

type Row = StatsDTO['daily'][number];

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">{fmtDayLong(String(label))}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-medium text-ink">{fmtInt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function DailyChart({ daily }: { daily: Row[] }) {
  const { dark } = useTheme();
  const c = chartColors(dark);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const single = daily.length <= 1;

  const legend = (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded" style={{ background: c.series[0] }} /> Scans
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded" style={{ background: c.series[1] }} /> Visitantes únicos
      </span>
    </div>
  );

  return (
    <Card
      title="Scans por dia"
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {view === 'chart' && legend}
          <Segmented ariaLabel="Visualização" value={view} onChange={setView} options={[{ value: 'chart', label: 'Gráfico' }, { value: 'table', label: 'Tabela' }]} />
        </div>
      }
    >
      {view === 'chart' ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={fmtDayShort}
                tick={{ fill: c.muted, fontSize: 12 }}
                axisLine={{ stroke: c.axis }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => fmtInt(v)} />
              <Tooltip content={ChartTooltip} cursor={{ stroke: c.axis, strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="count"
                name="Scans"
                stroke={c.series[0]}
                strokeWidth={2}
                dot={single ? { r: 4, fill: c.series[0], stroke: c.surface, strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: c.series[0], stroke: c.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="unique"
                name="Visitantes únicos"
                stroke={c.series[1]}
                strokeWidth={2}
                dot={single ? { r: 4, fill: c.series[1], stroke: c.surface, strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: c.series[1], stroke: c.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                <th className="py-2 font-medium">Dia</th>
                <th className="py-2 text-right font-medium">Scans</th>
                <th className="py-2 text-right font-medium">Únicos</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="py-1.5 text-ink-2">{fmtDayLong(d.day)}</td>
                  <td className="tabular py-1.5 text-right text-ink">{fmtInt(d.count)}</td>
                  <td className="tabular py-1.5 text-right text-ink-2">{fmtInt(d.unique)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
