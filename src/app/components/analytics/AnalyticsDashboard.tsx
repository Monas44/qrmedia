import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StatsDTO } from '@shared/types';
import { api, qs } from '../../lib/api';
import { fmtDay, fmtInt, languageName, orUnknown } from '../../lib/format';
import { PRESET_LABELS, presetPeriod, todayLocal, type PeriodPreset, type PeriodValue } from '../../lib/period';
import { useApi } from '../../lib/useApi';
import { Alert, Icon, Input, Segmented, Spinner, Toggle } from '../ui';
import { BarList } from './BarList';
import { DataManagement } from './DataManagement';
import { DailyChart } from './DailyChart';
import { DeviceDonut } from './DeviceDonut';
import { Heatmap } from './Heatmap';
import { KpiCards } from './KpiCards';
import { RecentScans } from './RecentScans';

const PRESETS = (Object.keys(PRESET_LABELS) as PeriodPreset[]).map((value) => ({ value, label: PRESET_LABELS[value] }));

function readSaved(): { period: PeriodValue; bots: boolean } {
  try {
    const raw = sessionStorage.getItem('analytics-filters');
    if (raw) {
      const saved = JSON.parse(raw) as { preset: PeriodPreset; from: string; to: string; bots: boolean };
      const period = saved.preset === 'custom' ? { preset: saved.preset, from: saved.from, to: saved.to } : presetPeriod(saved.preset);
      return { period, bots: Boolean(saved.bots) };
    }
  } catch {
    // ignora filtros salvos inválidos
  }
  return { period: presetPeriod('30d'), bots: false };
}

export function AnalyticsDashboard({ linkId }: { linkId?: number }) {
  const [{ period, bots }, setFilters] = useState(readSaved);
  const update = (next: { period: PeriodValue; bots: boolean }) => {
    setFilters(next);
    try {
      sessionStorage.setItem('analytics-filters', JSON.stringify({ ...next.period, bots: next.bots }));
    } catch {
      // sem armazenamento: o filtro vale só nesta tela
    }
  };

  const scope = linkId ? `/links/${linkId}` : '';
  const params = { from: period.from, to: period.to, bots };
  const query = qs(params);
  // Incrementado após pausar/importar/lançar/limpar, para recarregar números e tabela.
  const [version, setVersion] = useState(0);
  const stats = useApi(() => api.get<StatsDTO>(`${scope}/stats${query}`), `${scope}${query}#${version}`);
  const s = stats.data;

  const setPreset = (preset: PeriodPreset) =>
    update({ bots, period: preset === 'custom' ? { ...period, preset } : presetPeriod(preset) });
  const setCustom = (field: 'from' | 'to', value: string) => {
    if (!value) return;
    const next = { ...period, preset: 'custom' as const, [field]: value };
    if (next.from > next.to) next[field === 'from' ? 'to' : 'from'] = value;
    update({ bots, period: next });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros — uma linha acima dos gráficos */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 lg:flex-row lg:items-center">
        <Segmented ariaLabel="Período" value={period.preset} onChange={setPreset} options={PRESETS} />
        {period.preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="Data inicial" value={period.from} max={todayLocal()} onChange={(e) => setCustom('from', e.target.value)} className="w-auto" />
            <span className="text-sm text-muted">até</span>
            <Input type="date" aria-label="Data final" value={period.to} max={todayLocal()} onChange={(e) => setCustom('to', e.target.value)} className="w-auto" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 lg:ml-auto">
          <Toggle checked={bots} onChange={(v) => update({ period, bots: v })} label="Incluir bots" />
          <a
            href={`/api${scope}/scans/export${query}`}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-surface-2"
          >
            <Icon name="download" className="size-4" /> CSV
          </a>
        </div>
      </div>

      <DataManagement linkId={linkId} period={period} onChanged={() => setVersion((v) => v + 1)} />

      {stats.error && <Alert>{stats.error}</Alert>}
      {!s && stats.loading && <Spinner label="Calculando estatísticas…" />}

      {s && (
        <div className={`flex flex-col gap-4 transition-opacity ${stats.loading ? 'opacity-60' : ''}`}>
          <p className="text-xs text-muted">
            {fmtDay(period.from)} – {fmtDay(period.to)} · comparado com os {s.range.days} {s.range.days === 1 ? 'dia anterior' : 'dias anteriores'} · horário de Brasília
            {!bots && s.bot_scans > 0 && ` · ${fmtInt(s.bot_scans)} acessos de bots excluídos`}
            {s.imported_scans > 0 && ` · inclui ${fmtInt(s.imported_scans)} ${s.imported_scans === 1 ? 'registro importado ou manual' : 'registros importados ou manuais'}`}
          </p>

          <KpiCards stats={s} />
          <DailyChart daily={s.daily} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Heatmap cells={s.heatmap} />
            <DeviceDonut items={s.devices} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <BarList title="Sistemas operacionais" items={s.os.map((o) => ({ key: o.label ?? '?', label: orUnknown(o.label), count: o.count }))} />
            <BarList title="Navegadores" items={s.browsers.map((b) => ({ key: b.label ?? '?', label: orUnknown(b.label), count: b.count }))} />
            <BarList title="Origem (referrer)" items={s.referrers.map((r) => ({ key: r.label ?? 'direct', label: r.label ?? 'Direto / leitura do QR', count: r.count }))} />
            <BarList title="Idiomas" items={s.languages.map((l) => ({ key: l.label ?? '?', label: languageName(l.label), count: l.count }))} />
            {!linkId && (
              <BarList
                title="Links mais escaneados"
                items={s.top_links.map((l) => ({
                  key: String(l.link_id),
                  label: (
                    <Link to={`/links/${l.link_id}`} className="hover:text-accent">
                      {l.title || `/${l.slug}`}
                    </Link>
                  ),
                  count: l.count,
                }))}
              />
            )}
          </div>

          <RecentScans basePath={`${scope}/scans`} params={params} showLink={!linkId} refreshKey={version} />
        </div>
      )}
    </div>
  );
}
