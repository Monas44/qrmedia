-- Links dinâmicos: o slug é fixo (vai impresso no QR), o destino pode mudar.
CREATE TABLE links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL,
  destination_url TEXT    NOT NULL,
  title           TEXT,
  tags            TEXT    NOT NULL DEFAULT '[]', -- array JSON de strings
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  expires_at      TEXT,                          -- ISO 8601 UTC ou NULL
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_links_slug ON links (slug);

CREATE TABLE link_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id    INTEGER NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  old_url    TEXT    NOT NULL,
  new_url    TEXT    NOT NULL,
  changed_at TEXT    NOT NULL
);

CREATE INDEX idx_link_history_link ON link_history (link_id, changed_at);

-- Um registro por scan. Nenhum IP é armazenado: visitor_hash = SHA-256(salt diário | IP | UA).
CREATE TABLE scans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id      INTEGER NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  ts           TEXT    NOT NULL,                 -- ISO 8601 UTC
  country      TEXT,
  region       TEXT,
  city         TEXT,
  latitude     REAL,
  longitude    REAL,
  timezone     TEXT,
  device_type  TEXT,                             -- mobile | tablet | desktop
  os           TEXT,
  browser      TEXT,
  referrer     TEXT,                             -- apenas o hostname
  language     TEXT,
  visitor_hash TEXT    NOT NULL,
  is_bot       INTEGER NOT NULL DEFAULT 0 CHECK (is_bot IN (0, 1))
);

-- is_bot no fim do índice permite filtrar bots sem ler a linha da tabela.
CREATE INDEX idx_scans_link_ts ON scans (link_id, ts, is_bot);
-- Analytics geral (todos os links) por período.
CREATE INDEX idx_scans_ts ON scans (ts, is_bot);
