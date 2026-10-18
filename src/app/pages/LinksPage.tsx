import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LinkListItemDTO, LinkSortField } from '@shared/types';
import { PageHeader } from '../components/Layout';
import { Alert, buttonClass, CopyButton, EmptyState, Icon, Input, Select, Spinner, StatusBadge } from '../components/ui';
import { api, qs } from '../lib/api';
import { fmtInt, relativeTime } from '../lib/format';
import { useApi } from '../lib/useApi';

const SORTS: { value: `${LinkSortField}:${'asc' | 'desc'}`; label: string }[] = [
  { value: 'created_at:desc', label: 'Mais recentes' },
  { value: 'created_at:asc', label: 'Mais antigos' },
  { value: 'total_scans:desc', label: 'Mais scans' },
  { value: 'scans_24h:desc', label: 'Mais scans (24h)' },
  { value: 'title:asc', label: 'Título (A–Z)' },
  { value: 'updated_at:desc', label: 'Editados recentemente' },
];

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function LinksPage() {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [sortKey, setSortKey] = useState<(typeof SORTS)[number]['value']>('created_at:desc');
  const q = useDebounced(search);
  const [sort, order] = sortKey.split(':') as [LinkSortField, 'asc' | 'desc'];

  const query = qs({ q, tag, sort, order });
  const links = useApi(() => api.get<LinkListItemDTO[]>(`/links${query}`), query);
  const tags = useApi(() => api.get<string[]>('/links/tags'), 'tags');

  const filtering = Boolean(q || tag);

  return (
    <>
      <PageHeader
        title="Links"
        subtitle={links.data ? `${fmtInt(links.data.length)} ${links.data.length === 1 ? 'link' : 'links'}` : undefined}
        actions={
          <Link to="/links/new" className={buttonClass('primary')}>
            <Icon name="plus" className="size-4" /> Novo link
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
            <Icon name="search" className="size-4" />
          </span>
          <Input type="search" aria-label="Buscar links" placeholder="Buscar por título, slug ou destino" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filtrar por tag" value={tag} onChange={(e) => setTag(e.target.value)} className="sm:w-44">
          <option value="">Todas as tags</option>
          {tags.data?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select aria-label="Ordenar" value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)} className="sm:w-52">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {links.error && <Alert>{links.error}</Alert>}
      {links.loading && !links.data && <Spinner />}

      {links.data && links.data.length === 0 && (
        <div className="rounded-xl border border-line bg-surface">
          {filtering ? (
            <EmptyState title="Nenhum link encontrado">Tente outra busca ou remova o filtro de tag.</EmptyState>
          ) : (
            <EmptyState title="Você ainda não tem links">
              <Link to="/links/new" className="font-medium text-accent hover:underline">
                Crie o primeiro QR code dinâmico
              </Link>
            </EmptyState>
          )}
        </div>
      )}

      {links.data && links.data.length > 0 && (
        <>
          {/* Tabela (desktop) */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 font-medium">Destino</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Scans</th>
                  <th className="px-4 py-3 text-right font-medium">24h</th>
                  <th className="px-4 py-3 font-medium">Último scan</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {links.data.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-2/50">
                    <td className="max-w-64 px-4 py-3">
                      <Link to={`/links/${l.id}`} className="block truncate font-medium text-ink hover:text-accent">
                        {l.title || l.slug}
                      </Link>
                      <div className="truncate text-xs text-muted">/{l.slug}</div>
                      {l.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <button key={t} type="button" onClick={() => setTag(t)} className="rounded bg-surface-2 px-1.5 text-xs text-ink-2 hover:text-ink">
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="max-w-72 px-4 py-3">
                      <a href={l.destination_url} target="_blank" rel="noreferrer noopener" className="block truncate text-ink-2 hover:text-ink" title={l.destination_url}>
                        {l.destination_url.replace(/^https?:\/\//, '')}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={l.is_active} expiresAt={l.expires_at} />
                    </td>
                    <td className="tabular px-4 py-3 text-right font-medium text-ink">{fmtInt(l.total_scans)}</td>
                    <td className="tabular px-4 py-3 text-right text-ink-2">{fmtInt(l.scans_24h)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-2">{relativeTime(l.last_scan_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <CopyButton text={l.short_url} label="Copiar URL" />
                        <Link to={`/links/${l.id}`} className={buttonClass('ghost', 'sm')} aria-label={`Abrir ${l.title || l.slug}`}>
                          <Icon name="chart" className="size-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartões (celular) */}
          <ul className="flex flex-col gap-3 md:hidden">
            {links.data.map((l) => (
              <li key={l.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/links/${l.id}`} className="min-w-0">
                    <div className="truncate font-medium text-ink">{l.title || l.slug}</div>
                    <div className="truncate text-xs text-muted">{l.short_url.replace(/^https?:\/\//, '')}</div>
                  </Link>
                  <StatusBadge active={l.is_active} expiresAt={l.expires_at} />
                </div>
                <div className="mt-2 truncate text-sm text-ink-2">→ {l.destination_url.replace(/^https?:\/\//, '')}</div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="tabular text-sm text-ink-2">
                    <span className="font-semibold text-ink">{fmtInt(l.total_scans)}</span> scans · {fmtInt(l.scans_24h)} em 24h
                  </div>
                  <CopyButton text={l.short_url} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
