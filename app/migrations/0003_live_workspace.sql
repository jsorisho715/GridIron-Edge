CREATE TABLE IF NOT EXISTS ge_workspace_cache (
  id INTEGER PRIMARY KEY CHECK(id=1),
  connection_revision TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ge_workspace_preferences (
  scope TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ge_sync_health (
  id INTEGER PRIMARY KEY CHECK(id=1),
  last_attempt INTEGER, last_success INTEGER, next_attempt INTEGER,
  failures INTEGER NOT NULL DEFAULT 0,
  error TEXT, heartbeat INTEGER,
  lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO ge_sync_health(id) VALUES(1);
CREATE TABLE IF NOT EXISTS ge_alerts (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,
  detail TEXT NOT NULL, player_id TEXT, kind TEXT NOT NULL,
  created_at INTEGER NOT NULL, notified_at INTEGER
);
CREATE INDEX IF NOT EXISTS ge_alerts_scope_date ON ge_alerts(scope,created_at);
CREATE TABLE IF NOT EXISTS ge_push_config (
  id INTEGER PRIMARY KEY CHECK(id=1), public_key TEXT NOT NULL, envelope TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ge_push_subscriptions (
  id TEXT PRIMARY KEY, envelope TEXT NOT NULL, created_at INTEGER NOT NULL,
  last_success INTEGER, failures INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ge_weekly_history (
  scope TEXT NOT NULL, season INTEGER NOT NULL, week INTEGER NOT NULL,
  summary TEXT NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(scope,season,week)
);
