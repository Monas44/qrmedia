import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { ClearScansInput, ImportResultDTO, LinkDTO, LinkListItemDTO, ManualScansInput, SettingsDTO } from '@shared/types';
import { api, errorMessage } from '../../lib/api';
import { fmtDay, fmtInt } from '../../lib/format';
import { todayLocal, type PeriodValue } from '../../lib/period';
import { useApi } from '../../lib/useApi';
import { Alert, Button, cx, Field, Icon, Input, Segmented, Select } from '../ui';

type Tab = 'manual' | 'import' | 'clear';
const TABS: { value: Tab; label: string }[] = [
  { value: 'manual', label: 'Adicionar acessos' },
  { value: 'import', label: 'Importar CSV' },
  { value: 'clear', label: 'Limpar histórico' },
];

const nowTime = () =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

function Feedback({ result }: { result: { tone: 'ok' | 'error'; text: string } | null }) {
  if (!result) return null;
  return result.tone === 'ok' ? (
    <p role="status" className="flex items-center gap-1.5 text-sm text-good">
      <Icon name="check" className="size-4" /> {result.text}
    </p>
  ) : (
    <Alert>{result.text}</Alert>
  );
}

// ---------- pausa ----------

function PauseRow({ linkId, onChanged }: { linkId?: number; onChanged: () => void }) {
  const settings = useApi(() => api.get<SettingsDTO>('/settings'), 'settings');
  const link = useApi(() => (linkId ? api.get<LinkDTO>(`/links/${linkId}`) : Promise.resolve(null)), `link-${linkId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const globalPaused = settings.data?.analytics_paused ?? false;
  const linkPaused = link.data?.analytics_paused ?? false;
  const paused = linkId ? linkPaused || globalPaused : globalPaused;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (linkId) {
        const updated = await api.patch<LinkDTO>(`/links/${linkId}`, { analytics_paused: !linkPaused });
        link.setData(updated);
      } else {
        settings.setData(await api.patch<SettingsDTO>('/settings', { analytics_paused: !globalPaused }));
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!settings.data || (linkId && !link.data)) return null;

  const status = paused
    ? linkId && globalPaused
      ? 'Coleta pausada para todos os links (configuração geral).'
      : linkId
        ? 'Coleta pausada para este link.'
        : 'Coleta pausada para todos os links.'
    : 'Coleta ativa.';

  return (
    <div className={cx('flex flex-wrap items-center gap-3 rounded-lg px-3 py-2', paused ? 'bg-warn-bg text-warn-ink' : 'bg-surface-2 text-ink-2')}>
      <span className={cx('size-2 rounded-full', paused ? 'bg-[var(--warn-ink)]' : 'bg-[var(--good)]')} aria-hidden="true" />
      <span className="text-sm">
        <strong className="font-semibold">{status}</strong>{' '}
        {paused ? 'Os QR codes continuam redirecionando, mas os acessos não são registrados.' : 'Cada leitura do QR é registrada.'}
      </span>
      {/* No link, se a pausa geral estiver ligada, ela é desligada no Analytics geral. */}
      {!(linkId && globalPaused) && (
        <Button size="sm" className="ml-auto" onClick={toggle} disabled={busy}>
          {(linkId ? linkPaused : globalPaused) ? 'Retomar coleta' : linkId ? 'Pausar coleta deste link' : 'Pausar coleta de todos'}
        </Button>
      )}
      {error && <span className="w-full text-sm text-bad">{error}</span>}
    </div>
  );
}

// ---------- adicionar acessos ----------

function ManualForm({ linkId, onChanged }: { linkId?: number; onChanged: () => void }) {
  const links = useApi(() => (linkId ? Promise.resolve([]) : api.get<LinkListItemDTO[]>('/links?sort=title&order=asc')), `links-${linkId ?? 'all'}`);
  const [target, setTarget] = useState<string>('');
  const [date, setDate] = useState(todayLocal);
  const [time, setTime] = useState(nowTime);
  const [count, setCount] = useState(1);
  const [device, setDevice] = useState<'' | 'mobile' | 'tablet' | 'desktop'>('mobile');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = linkId ?? Number(target);
    if (!id) return setResult({ tone: 'error', text: 'Escolha o link.' });
    setBusy(true);
    setResult(null);
    try {
      const body: ManualScansInput = { link_id: id, ts: `${date} ${time}`, count, device_type: device || null };
      const { inserted } = await api.post<{ inserted: number }>('/scans/manual', body);
      setResult({ tone: 'ok', text: `${fmtInt(inserted)} ${inserted === 1 ? 'acesso lançado' : 'acessos lançados'} em ${fmtDay(date)} às ${time}.` });
      onChanged();
    } catch (err) {
      setResult({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">Registre acessos com data e hora específicas (horário de Brasília). Eles ficam marcados como “manual”.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {!linkId && (
          <div className="sm:col-span-2 lg:col-span-1">
            <Field label="Link" htmlFor="manual-link">
              <Select id="manual-link" required value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Escolha…</option>
                {links.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title || l.slug} (/{l.slug})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Data" htmlFor="manual-date">
          <Input id="manual-date" type="date" required max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora" htmlFor="manual-time">
          <Input id="manual-time" type="time" step={1} required value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Quantidade" htmlFor="manual-count">
          <Input id="manual-count" type="number" min={1} max={1000} required value={count} onChange={(e) => setCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} />
        </Field>
        <Field label="Dispositivo" htmlFor="manual-device">
          <Select id="manual-device" value={device} onChange={(e) => setDevice(e.target.value as typeof device)}>
            <option value="mobile">Celular</option>
            <option value="tablet">Tablet</option>
            <option value="desktop">Computador</option>
            <option value="">Não informado</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Lançando…' : 'Lançar acessos'}
        </Button>
        <Feedback result={result} />
      </div>
    </form>
  );
}

// ---------- importar ----------

function downloadTemplate(withSlug: boolean) {
  const header = withSlug ? 'slug;data;hora;dispositivo;quantidade' : 'data;hora;dispositivo;quantidade';
  const row = withSlug ? 'meu-slug;18/10/2026;14:30;celular;1' : '18/10/2026;14:30;celular;1';
  const blob = new Blob([`﻿${header}\n${row}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: 'modelo-importacao-acessos.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportForm({ linkId, onChanged }: { linkId?: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError('Arquivo grande demais (máx. 10 MB). Divida o CSV.');
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await api.post<ImportResultDTO>('/scans/import', { csv, link_id: linkId ?? null });
      setResult(res);
      if (res.imported > 0) onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-ink-2">
        <p>
          Envie um CSV (separado por vírgula ou ponto e vírgula). Colunas aceitas: <strong className="text-ink">data</strong> e{' '}
          <strong className="text-ink">hora</strong> (ou <code>data_hora</code>){!linkId && <>, <strong className="text-ink">slug</strong></>}, e opcionais{' '}
          <code>dispositivo</code>, <code>quantidade</code>, <code>sistema</code>, <code>navegador</code>, <code>origem</code>, <code>idioma</code>.
        </p>
        <p className="mt-1">O CSV exportado por este painel também pode ser importado (serve como backup). Se alguma linha tiver erro, nada é importado.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className={cx('inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover', busy && 'pointer-events-none opacity-50')}>
          <Icon name="download" className="size-4 rotate-180" />
          {busy ? 'Importando…' : 'Escolher arquivo CSV'}
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="sr-only" disabled={busy} />
        </label>
        <Button variant="ghost" size="sm" onClick={() => downloadTemplate(!linkId)}>
          Baixar modelo
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {result && result.errors.length === 0 && (
        <Feedback result={{ tone: 'ok', text: `${fmtInt(result.imported)} acessos importados de ${fmtInt(result.rows)} linhas.` }} />
      )}
      {result && result.errors.length > 0 && (
        <div role="alert" className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <p className="font-medium text-bad">Nada foi importado. Corrija as linhas abaixo e envie de novo:</p>
          <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-ink-2">
            {result.errors.map((e) => (
              <li key={`${e.line}-${e.message}`}>
                Linha {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- limpar ----------

function ClearForm({ linkId, period, onChanged }: { linkId?: number; period: PeriodValue; onChanged: () => void }) {
  const [range, setRange] = useState<'period' | 'all'>('period');
  const [only, setOnly] = useState<'all' | 'imported'>('all');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const scopeText = `${linkId ? 'deste link' : 'de TODOS os links'}${range === 'period' ? ` entre ${fmtDay(period.from)} e ${fmtDay(period.to)}` : ', em todo o histórico'}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const body: ClearScansInput = {
        link_id: linkId ?? null,
        from: range === 'period' ? period.from : null,
        to: range === 'period' ? period.to : null,
        only,
        confirm,
      };
      const { deleted } = await api.post<{ deleted: number }>('/scans/clear', body);
      setResult({ tone: 'ok', text: `${fmtInt(deleted)} ${deleted === 1 ? 'registro apagado' : 'registros apagados'}.` });
      setConfirm('');
      onChanged();
    } catch (err) {
      setResult({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Alert tone="warn">Apagar é definitivo. Antes, baixe o CSV (botão “CSV” acima) para ter uma cópia que pode ser importada de volta.</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quais datas" htmlFor="clear-range">
          <Select id="clear-range" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            <option value="period">
              Período selecionado ({fmtDay(period.from)} – {fmtDay(period.to)})
            </option>
            <option value="all">Todo o histórico</option>
          </Select>
        </Field>
        <Field label="Quais registros" htmlFor="clear-only">
          <Select id="clear-only" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="all">Todos (inclusive leituras reais do QR)</option>
            <option value="imported">Só importados e lançados manualmente</option>
          </Select>
        </Field>
      </div>
      <Field label={`Digite APAGAR para apagar os registros ${scopeText}`} htmlFor="clear-confirm">
        <Input id="clear-confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APAGAR" className="sm:max-w-xs" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={busy || confirm !== 'APAGAR'}>
          <Icon name="trash" className="size-4" /> {busy ? 'Apagando…' : 'Apagar registros'}
        </Button>
        <Feedback result={result} />
      </div>
    </form>
  );
}

// ---------- painel ----------

export function DataManagement({ linkId, period, onChanged }: { linkId?: number; period: PeriodValue; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('manual');

  return (
    <div className="flex flex-col gap-3">
      <PauseRow linkId={linkId} onChanged={onChanged} />
      <div className="rounded-xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-ink"
        >
          Gerenciar dados
          <span className="text-xs font-normal text-muted">{open ? 'ocultar' : 'adicionar, importar ou limpar acessos'}</span>
        </button>
        {open && (
          <div className="flex flex-col gap-4 border-t border-line p-4">
            <Segmented ariaLabel="Ação" value={tab} onChange={setTab} options={TABS} />
            {tab === 'manual' && <ManualForm linkId={linkId} onChanged={onChanged} />}
            {tab === 'import' && <ImportForm linkId={linkId} onChanged={onChanged} />}
            {tab === 'clear' && <ClearForm linkId={linkId} period={period} onChanged={onChanged} />}
          </div>
        )}
      </div>
    </div>
  );
}
