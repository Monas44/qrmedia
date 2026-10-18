import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { ClearResultDTO, ClearScansInput, ImportResultDTO, LinkDTO, LinkListItemDTO, ManualScansInput, SettingsDTO } from '@shared/types';
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

type RangeMode = 'period' | 'custom' | 'all';
const RANGE_OPTIONS: { value: RangeMode; label: string }[] = [
  { value: 'period', label: 'Período do filtro' },
  { value: 'custom', label: 'Datas e horas' },
  { value: 'all', label: 'Todo o histórico' },
];

const fmtLocal = (date: string, time: string) => `${fmtDay(date)} ${time}`;

/** Lista de QR codes com busca e seleção múltipla. */
function LinkPicker({
  links,
  selected,
  onChange,
}: {
  links: LinkListItemDTO[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = q
    ? links.filter((l) => [l.title, l.slug, l.destination_url, ...l.tags].some((v) => v?.toLowerCase().includes(q)))
    : links;

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const setVisible = (on: boolean) => {
    const next = new Set(selected);
    for (const l of visible) {
      if (on) next.add(l.id);
      else next.delete(l.id);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Buscar QR codes"
          placeholder="Buscar por título, slug ou tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Button size="sm" variant="ghost" onClick={() => setVisible(true)}>
          {q ? 'Marcar resultados' : 'Marcar todos'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVisible(false)}>
          {q ? 'Desmarcar resultados' : 'Desmarcar todos'}
        </Button>
        <span className="tabular ml-auto text-xs text-muted">
          {fmtInt(selected.size)} de {fmtInt(links.length)} selecionados
        </span>
      </div>
      <ul className="max-h-56 overflow-auto rounded-lg border border-line" aria-label="QR codes">
        {visible.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nenhum QR code encontrado.</li>}
        {visible.map((l) => (
          <li key={l.id} className="border-b border-line last:border-0">
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="size-4 accent-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate text-ink">{l.title || l.slug}</span>
              <span className="shrink-0 text-xs text-muted">/{l.slug}</span>
              <span className="tabular shrink-0 text-xs text-muted">{fmtInt(l.total_scans)} scans</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClearForm({ linkId, period, onChanged }: { linkId?: number; period: PeriodValue; onChanged: () => void }) {
  const links = useApi(() => api.get<LinkListItemDTO[]>('/links?sort=title&order=asc'), 'clear-links');
  const [selected, setSelected] = useState<Set<number> | null>(null); // null = ainda não inicializado
  const [range, setRange] = useState<RangeMode>('period');
  const [fromDate, setFromDate] = useState(period.from);
  const [fromTime, setFromTime] = useState('00:00');
  const [toDate, setToDate] = useState(period.to);
  const [toTime, setToTime] = useState('23:59');
  const [only, setOnly] = useState<'all' | 'imported'>('all');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ matched: number } | { error: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  // Seleção inicial: na página de um link, só ele; no analytics geral, todos.
  useEffect(() => {
    if (links.data && selected === null) setSelected(new Set(linkId ? [linkId] : links.data.map((l) => l.id)));
  }, [links.data, linkId, selected]);

  const bounds =
    range === 'period'
      ? { from: period.from, to: period.to, text: `de ${fmtDay(period.from)} a ${fmtDay(period.to)}` }
      : range === 'custom'
        ? { from: `${fromDate} ${fromTime}`, to: `${toDate} ${toTime}`, text: `de ${fmtLocal(fromDate, fromTime)} até ${fmtLocal(toDate, toTime)}` }
        : { from: null, to: null, text: 'em todo o histórico' };

  const ids = selected ? [...selected] : [];
  const body: ClearScansInput = { link_ids: ids, from: bounds.from, to: bounds.to, only };
  const bodyKey = JSON.stringify(body);

  // Prévia: conta quantos registros seriam apagados sempre que os filtros mudam.
  useEffect(() => {
    if (!selected) return;
    if (ids.length === 0) {
      setPreview({ matched: 0 });
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api.post<ClearResultDTO>('/scans/clear', { ...body, dry_run: true }).then(
        (r) => !cancelled && setPreview({ matched: r.matched }),
        (err) => !cancelled && setPreview({ error: errorMessage(err) }),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // bodyKey resume o body inteiro
  }, [bodyKey, refresh]);

  const matched = preview && 'matched' in preview ? preview.matched : 0;
  const qrText = ids.length === 1 ? '1 QR code' : `${fmtInt(ids.length)} QR codes`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const { deleted } = await api.post<ClearResultDTO>('/scans/clear', { ...body, confirm });
      setResult({ tone: 'ok', text: `${fmtInt(deleted)} ${deleted === 1 ? 'registro apagado' : 'registros apagados'}.` });
      setConfirm('');
      setRefresh((n) => n + 1);
      links.reload();
      onChanged();
    } catch (err) {
      setResult({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (links.error) return <Alert>{links.error}</Alert>;
  if (!links.data || !selected) return <p className="text-sm text-muted">Carregando QR codes…</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Alert tone="warn">Apagar é definitivo. Antes, baixe o CSV (botão “CSV” acima) para ter uma cópia que pode ser importada de volta.</Alert>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium text-ink">1. Período</legend>
        <Segmented ariaLabel="Período" value={range} onChange={setRange} options={RANGE_OPTIONS} />
        {range === 'period' && (
          <p className="text-sm text-ink-2">
            Do filtro acima: {fmtDay(period.from)} 00:00 até {fmtDay(period.to)} 23:59.
          </p>
        )}
        {range === 'custom' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-2">
              <Field label="De (data)" htmlFor="clear-from-date">
                <Input id="clear-from-date" type="date" required max={todayLocal()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </Field>
              <Field label="Hora" htmlFor="clear-from-time">
                <Input id="clear-from-time" type="time" required value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-2">
              <Field label="Até (data)" htmlFor="clear-to-date">
                <Input id="clear-to-date" type="date" required value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </Field>
              <Field label="Hora" htmlFor="clear-to-time">
                <Input id="clear-to-time" type="time" required value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted sm:col-span-2">Horário de Brasília. O horário final está incluído (até 23:59 inclui o minuto inteiro).</p>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">2. QR codes</legend>
        <LinkPicker links={links.data} selected={selected} onChange={setSelected} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">3. Quais registros</legend>
        <Select id="clear-only" aria-label="Quais registros" value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className="sm:max-w-md">
          <option value="all">Todos (inclusive leituras reais do QR)</option>
          <option value="imported">Só importados e lançados manualmente</option>
        </Select>
      </fieldset>

      <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm" aria-live="polite">
        {preview && 'error' in preview ? (
          <span className="text-bad">{preview.error}</span>
        ) : ids.length === 0 ? (
          <span className="text-ink-2">Marque pelo menos um QR code.</span>
        ) : (
          <span className="text-ink">
            <strong className="tabular">{fmtInt(matched)}</strong> {matched === 1 ? 'registro será apagado' : 'registros serão apagados'} · {qrText} ·{' '}
            {bounds.text}
            {only === 'imported' ? ' · só importados/manuais' : ''}
          </span>
        )}
      </div>

      <Field label="4. Digite APAGAR para confirmar" htmlFor="clear-confirm">
        <Input id="clear-confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="APAGAR" className="sm:max-w-xs" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" disabled={busy || confirm !== 'APAGAR' || ids.length === 0 || matched === 0 || (preview !== null && 'error' in preview)}>
          <Icon name="trash" className="size-4" /> {busy ? 'Apagando…' : `Apagar ${fmtInt(matched)} ${matched === 1 ? 'registro' : 'registros'}`}
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
