-- Excel Heroes cloud backend (Cloudflare D1). Apply with:
--   npx wrangler d1 execute excel-heroes --remote --file=backend/schema.sql
CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,   -- client-generated device id (8-64 url-safe chars)
  secret_hash TEXT NOT NULL,      -- sha256 of the client's secret; the secret itself is never stored
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  id         TEXT PRIMARY KEY REFERENCES devices(id),
  save       TEXT NOT NULL,       -- the full save JSON (≤ 256 KB, plausibility-checked)
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS board (
  id           TEXT PRIMARY KEY REFERENCES devices(id),
  name         TEXT NOT NULL,
  max_cleared  INTEGER NOT NULL DEFAULT 0,
  shares       INTEGER NOT NULL DEFAULT 0,
  prestige     INTEGER NOT NULL DEFAULT 0,
  dps          REAL    NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0,
  collection   INTEGER NOT NULL DEFAULT 0,
  score        REAL    NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS board_score ON board (score DESC, updated_at ASC);
CREATE TABLE IF NOT EXISTS ad_views (
  n    INTEGER PRIMARY KEY AUTOINCREMENT,
  id   TEXT NOT NULL,
  kind TEXT NOT NULL,
  at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_views_id_at ON ad_views (id, at);
