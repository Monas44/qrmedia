import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { CountItem } from '@shared/types';
import { deviceLabel, fmtDec, fmtInt } from '../../lib/format';
import { chartColors, useTheme } from '../../lib/theme';
import { Card, EmptyState } from '../ui';

// Cor fixa por entidade (nunca por ranking): celular, computador, tablet.
const ORDER = ['mobile', 'desktop', 'tablet'] as const;

function DonutTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const p = payload?.[0];
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <span className="font-medium text-ink">{p.name}</span>: <span className="tabular text-ink-2">{fmtInt(Number(p.value))}</span>
    </div>
  );
}

export function DeviceDonut({ items }: { items: CountItem[] }) {
  const { dark } = useTheme();
  const c = chartColors(dark);
  const total = items.reduce((s, i) => s + i.count, 0);
  const data = ORDER.map((key, i) => ({
    key,
    name: deviceLabel(key),
    value: items.find((d) => d.label === key)?.count ?? 0,
    color: c.series[i]!,
  }));

  return (
    <Card title="Dispositivos">
      {total === 0 ? (
        <EmptyState title="Sem dados no período" />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
          <div className="size-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke={c.surface} strokeWidth={2} isAnimationActive={false}>
                  {data
                    .filter((d) => d.value > 0)
                    .map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                </Pie>
                <Tooltip content={DonutTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legenda com rótulo direto e % — identidade nunca depende só da cor */}
          <ul className="flex w-full flex-col gap-2">
            {data.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink">
                  <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="tabular text-ink-2">
                  {fmtDec(total ? (d.value / total) * 100 : 0)}% <span className="text-xs text-muted">({fmtInt(d.value)})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
