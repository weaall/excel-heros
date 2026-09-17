-- Excel Heroes cloud backend (Cloudflare D1). Apply with:
--   npx wrangler d1 execute excel-heroes --remote --file=backend/schema.sql --config backend/wrangler.toml
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,      -- 'g_' + random; stable app-side id (never the Google sub itself)
  google_sub  TEXT NOT NULL UNIQUE,  -- Google account subject claim
  email       TEXT,
  name        TEXT NOT NULL,
  picture     TEXT,
  created_at  INTEGER NOT NULL,
  last_login  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,       -- SHA-256 of the 64-hex session token (never the token itself)
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS saves (
  id         TEXT PRIMARY KEY REFERENCES users(id),
  save       TEXT NOT NULL,          -- the full save JSON (≤ 256 KB, plausibility-checked)
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS board (
  id           TEXT PRIMARY KEY REFERENCES users(id),
  name         TEXT NOT NULL,
  picture      TEXT,
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
