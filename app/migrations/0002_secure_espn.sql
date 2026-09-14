-- Owner-only credentials; cookies encrypted with an external AES-256-GCM key.
CREATE TABLE IF NOT EXISTS ge_owner_sessions (
  hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ge_owner_sessions_expiry ON ge_owner_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ge_connection_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ge_connection_limits_expiry ON ge_connection_limits(expires_at);
CREATE TABLE IF NOT EXISTS ge_espn_connection (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  envelope TEXT NOT NULL,
  metadata TEXT NOT NULL,
  revision TEXT NOT NULL
);
