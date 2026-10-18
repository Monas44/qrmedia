import { useEffect, useState } from 'react';
import type { Paginated, ScanRowDTO } from '@shared/types';
import { api, qs } from '../../lib/api';
import { deviceLabel, fmtDateTime, fmtInt, languageName } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../ui';

const PAGE_SIZE = 25;

export function RecentScans({ basePath, params, showLink }: { basePath: string; params: Record<string, string | boolean>; showLink: boolean }) {
  const [page, setPage] = useState(1);
  const filterKey = JSON.stringify(params);
  useEffect(() => setPage(1), [filterKey]);

  const query = qs({ ...params, page, page_size: PAGE_SIZE });
  const scans = useApi(() => api.get<Paginated<ScanRowDTO>>(`${basePath}${query}`), `${basePath}${query}`);
  const pages = scans.data ? Math.max(1, Math.ceil(scans.data.total / PAGE_SIZE)) : 1;

  return (
    <Card title="Scans recentes" actions={scans.data && <span className="tabular text-xs text-muted">{fmtInt(scans.data.total)} no período</span>}>
      {scans.error && <Alert>{scans.error}</Alert>}
      {!scans.data && scans.loading && <Spinner />}
      {scans.data && scans.data.items.length === 0 && <EmptyState title="Nenhum scan no período" />}
      {scans.data && scans.data.items.length > 0 && (
        <>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium sm:px-5">Data e hora</th>
                  {showLink && <th className="px-2 py-2 font-medium">Link</th>}
                  <th className="px-2 py-2 font-medium">Dispositivo</th>
                  <th className="px-2 py-2 font-medium">Sistema / navegador</th>
                  <th className="px-2 py-2 font-medium">Origem</th>
                  <th className="px-4 py-2 font-medium sm:px-5">Idioma</th>
                </tr>
              </thead>
              <tbody className={scans.loading ? 'opacity-60' : undefined}>
                {scans.data.items.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="tabular px-4 py-2 whitespace-nowrap text-ink sm:px-5">
                      {fmtDateTime(s.ts)} {s.is_bot && <Badge>bot</Badge>}
                    </td>
                    {showLink && <td className="px-2 py-2 text-ink-2">/{s.slug}</td>}
                    <td className="px-2 py-2 text-ink-2">{deviceLabel(s.device_type)}</td>
                    <td className="px-2 py-2 text-ink-2">{[s.os, s.browser].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-2 py-2 text-ink-2">{s.referrer ?? 'Direto / QR'}</td>
                    <td className="px-4 py-2 text-ink-2 sm:px-5">{s.language ? languageName(s.language) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1 || scans.loading}>
              Anterior
            </Button>
            <span className="tabular text-sm text-ink-2">
              Página {page} de {pages}
            </span>
            <Button size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages || scans.loading}>
              Próxima
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
