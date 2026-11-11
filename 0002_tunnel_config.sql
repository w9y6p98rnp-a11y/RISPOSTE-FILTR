-- Eseguire una sola volta nel database D1 rispostaflirt-auth.
CREATE TABLE IF NOT EXISTS tunnel_config (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
