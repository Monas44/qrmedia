import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { LinkDetailDTO, LinkDTO } from '@shared/types';
import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard';
import { PageHeader } from '../components/Layout';
import { initialValues, LinkForm, toPayload } from '../components/LinkForm';
import { QrDesigner } from '../components/QrDesigner';
import { Alert, Button, Card, CopyButton, Icon, Segmented, Spinner, StatusBadge } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAppConfig } from '../lib/config';
import { fmtDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';

type Tab = 'analytics' | 'qr' | 'edit';
const TABS: { value: Tab; label: string }[] = [
  { value: 'analytics', label: 'Analytics' },
  { value: 'qr', label: 'QR code' },
  { value: 'edit', label: 'Editar' },
];

export function LinkDetailPage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'analytics') as Tab;
  const navigate = useNavigate();
  const { base_url } = useAppConfig();
  const link = useApi(() => api.get<LinkDetailDTO>(`/links/${id}`), String(id));
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (link.error && !link.data) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>{link.error}</Alert>
        <Link to="/" className="text-sm text-accent hover:underline">
          Voltar para os links
        </Link>
      </div>
    );
  }
  if (!link.data) return <Spinner />;
  const l = link.data;

  const remove = async () => {
    if (!window.confirm(`Excluir o link /${l.slug}? Os QR codes impressos deixarão de funcionar e todos os scans serão apagados. Prefira desativar se quiser manter o histórico.`)) return;
    try {
      await api.delete(`/links/${l.id}`);
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
            <Icon name="back" className="size-4" /> Links
          </Link>
        }
        title={l.title || `/${l.slug}`}
        subtitle={
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge active={l.is_active} expiresAt={l.expires_at} />
              <span className="font-medium text-ink">{l.short_url.replace(/^https?:\/\//, '')}</span>
              {l.tags.map((t) => (
                <span key={t} className="rounded bg-surface-2 px-1.5 text-xs text-ink-2">
                  {t}
                </span>
              ))}
            </div>
            <a href={l.final_url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-center gap-1 truncate text-ink-2 hover:text-ink">
              → <span className="truncate">{l.final_url}</span> <Icon name="external" className="size-3.5 shrink-0" />
            </a>
            {l.expires_at && <span className="text-xs text-muted">Expira em {fmtDateTime(l.expires_at)}</span>}
          </div>
        }
        actions={<CopyButton text={l.short_url} label="Copiar URL curta" size="md" />}
      />

      <div className="mb-4">
        <Segmented ariaLabel="Seções do link" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={TABS} />
      </div>

      {tab === 'analytics' && <AnalyticsDashboard linkId={l.id} />}

      {tab === 'qr' && (
        <Card title="Gerador de QR code">
          <QrDesigner url={l.short_url} slug={l.slug} />
        </Card>
      )}

      {tab === 'edit' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="Configurações do link">
            {saved && (
              <div className="mb-4">
                <Alert tone="warn">Alterações salvas. O redirect já usa o novo destino.</Alert>
              </div>
            )}
            <LinkForm
              key={l.updated_at}
              mode="edit"
              baseUrl={base_url}
              initial={initialValues(l)}
              submitLabel="Salvar alterações"
              onSubmit={async (values) => {
                try {
                  await api.patch<LinkDTO>(`/links/${l.id}`, toPayload(values, false));
                  setSaved(true);
                  link.reload();
                } catch (err) {
                  throw new Error(errorMessage(err));
                }
              }}
            />
          </Card>
          <div className="flex flex-col gap-4">
            <Card title="Histórico de destinos">
              {l.history.length === 0 ? (
                <p className="text-sm text-muted">O destino ainda não foi alterado.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {l.history.map((h) => (
                    <li key={h.id} className="border-l-2 border-line pl-3 text-sm">
                      <div className="text-xs text-muted">{fmtDateTime(h.changed_at)}</div>
                      <div className="truncate text-ink-2 line-through" title={h.old_url}>
                        {h.old_url}
                      </div>
                      <div className="truncate text-ink" title={h.new_url}>
                        {h.new_url}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title="Zona de perigo">
              <p className="mb-3 text-sm text-ink-2">Excluir remove o link e todos os scans. Para pausar uma campanha, apenas desative.</p>
              {deleteError && (
                <div className="mb-3">
                  <Alert>{deleteError}</Alert>
                </div>
              )}
              <Button variant="danger" onClick={remove}>
                <Icon name="trash" className="size-4" /> Excluir link
              </Button>
            </Card>
            <p className="text-xs text-muted">
              Criado em {fmtDateTime(l.created_at)} · atualizado em {fmtDateTime(l.updated_at)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
