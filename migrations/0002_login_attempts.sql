-- Rate limit de login. key = SHA-256 do IP (o IP em si nunca é gravado).
CREATE TABLE login_attempts (
  key          TEXT    PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL                  -- epoch ms do início da janela
);
