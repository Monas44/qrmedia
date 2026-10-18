-- Origem de cada scan: 'qr' (leitura real do QR), 'import' (CSV) ou 'manual' (lançado no painel).
ALTER TABLE scans ADD COLUMN source TEXT NOT NULL DEFAULT 'qr' CHECK (source IN ('qr', 'import', 'manual'));

-- Pausa da coleta por link: o redirect continua, mas o scan não é gravado.
ALTER TABLE links ADD COLUMN analytics_paused INTEGER NOT NULL DEFAULT 0 CHECK (analytics_paused IN (0, 1));

-- Configurações gerais (ex.: analytics_paused = pausa global da coleta).
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
