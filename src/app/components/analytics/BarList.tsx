import type { ReactNode } from 'react';
import { fmtDec, fmtInt } from '../../lib/format';
import { Card, EmptyState } from '../ui';

export interface BarItem {
  key: string;
  label: ReactNode;
  count: number;
}

/** Lista de barras horizontais (uma série, um tom): rótulo, valor e participação. */
export function BarList({ title, items, limit = 8, empty = 'Sem dados no período' }: { title: string; items: BarItem[]; limit?: number; empty?: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  const max = Math.max(1, ...items.map((i) => i.count));
  const shown = items.slice(0, limit);

  return (
    <Card title={title}>
      {shown.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((item) => {
            const share = total ? (item.count / total) * 100 : 0;
            return (
              <li key={item.key} title={`${fmtInt(item.count)} scans (${fmtDec(share)}%)`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink">{item.label}</span>
                  <span className="tabular shrink-0 text-ink-2">
                    {fmtInt(item.count)} <span className="text-xs text-muted">· {fmtDec(share)}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
