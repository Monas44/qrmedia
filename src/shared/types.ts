// Contratos da API compartilhados entre o servidor e o painel.

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface LinkDTO {
  id: number;
  slug: string;
  short_url: string;
  destination_url: string;
  /** Destino com os UTMs aplicados — é para onde o redirect aponta. */
  final_url: string;
  title: string | null;
  tags: string[];
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_active: boolean;
  /** Coleta de scans pausada para este link (o redirect continua). */
  analytics_paused: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkListItemDTO extends LinkDTO {
  total_scans: number;
  scans_24h: number;
  last_scan_at: string | null;
}

export interface LinkHistoryDTO {
  id: number;
  old_url: string;
  new_url: string;
  changed_at: string;
}

export interface LinkDetailDTO extends LinkDTO {
  history: LinkHistoryDTO[];
}

export interface LinkInput {
  destination_url: string;
  slug?: string;
  title?: string | null;
  tags?: string[];
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  is_active?: boolean;
  analytics_paused?: boolean;
  expires_at?: string | null;
}

export type LinkPatch = Partial<Omit<LinkInput, 'slug'>>;

export type LinkSortField = 'created_at' | 'updated_at' | 'title' | 'slug' | 'total_scans' | 'scans_24h';

export interface CountItem {
  label: string | null;
  count: number;
}

export interface Kpis {
  total: number;
  unique_visitors: number;
  daily_average: number;
  peak_day: { day: string; count: number } | null;
}

export interface StatsDTO {
  range: {
    from: string;
    to: string;
    prev_from: string;
    prev_to: string;
    days: number;
    timezone: string;
    include_bots: boolean;
    link_id: number | null;
  };
  kpis: Kpis;
  previous: Kpis;
  /** Variação % vs período anterior; null quando o anterior é zero. */
  change: { total: number | null; unique_visitors: number | null; daily_average: number | null; peak_day: number | null };
  bot_scans: number;
  /** Scans no período vindos de importação ou lançamento manual (já incluídos nos números). */
  imported_scans: number;
  daily: { day: string; count: number; unique: number }[];
  /** dow: 0 = domingo … 6 = sábado; hour: 0–23 (America/Sao_Paulo). */
  heatmap: { dow: number; hour: number; count: number }[];
  devices: CountItem[];
  os: CountItem[];
  browsers: CountItem[];
  referrers: CountItem[];
  languages: CountItem[];
  top_links: { link_id: number; slug: string; title: string | null; count: number }[];
}

export interface ScanRowDTO {
  id: number;
  ts: string;
  link_id: number;
  slug: string;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  language: string | null;
  is_bot: boolean;
  source: ScanSource;
}

/** 'qr' = leitura real do QR; 'import' = CSV; 'manual' = lançado no painel. */
export type ScanSource = 'qr' | 'import' | 'manual';

export interface SettingsDTO {
  analytics_paused: boolean;
}

export interface ManualScansInput {
  link_id: number;
  /** Data e hora do acesso: ISO 8601 ou "YYYY-MM-DD HH:MM[:SS]" (horário de Brasília). */
  ts: string;
  count: number;
  device_type?: 'mobile' | 'tablet' | 'desktop' | null;
  os?: string | null;
  browser?: string | null;
  language?: string | null;
  referrer?: string | null;
}

export interface ImportScansInput {
  csv: string;
  /** Obrigatório se o CSV não tiver a coluna "slug". */
  link_id?: number | null;
}

export interface ImportResultDTO {
  imported: number;
  rows: number;
  errors: { line: number; message: string }[];
}

export interface ClearScansInput {
  /** Sem link_id = todos os links. */
  link_id?: number | null;
  /** Sem from/to = todo o histórico. Mesmo formato dos filtros de analytics. */
  from?: string | null;
  to?: string | null;
  /** 'all' = tudo; 'imported' = só registros importados/manuais. */
  only: 'all' | 'imported';
  /** Precisa ser exatamente "APAGAR". */
  confirm: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface AppConfigDTO {
  base_url: string;
  timezone: string;
}
