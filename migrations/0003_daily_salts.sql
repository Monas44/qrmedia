-- Salt diário do visitor_hash. Fica no banco para sobreviver a reinícios do
-- servidor e é apagado após 2 dias, impossibilitando recalcular hashes antigos.
CREATE TABLE daily_salts (
  day  TEXT PRIMARY KEY,                         -- YYYY-MM-DD (São Paulo)
  salt TEXT NOT NULL
);
