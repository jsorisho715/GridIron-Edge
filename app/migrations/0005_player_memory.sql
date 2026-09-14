CREATE TABLE IF NOT EXISTS ge_player_memory (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, player_id TEXT NOT NULL,
  kind TEXT NOT NULL, summary TEXT NOT NULL, observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ge_player_memory_lookup ON ge_player_memory(scope,player_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS ge_player_memory_recent ON ge_player_memory(scope,observed_at DESC);
CREATE INDEX IF NOT EXISTS ge_player_memory_retention ON ge_player_memory(observed_at);
CREATE TABLE IF NOT EXISTS ge_forecast_memory (
  scope TEXT NOT NULL, player_id TEXT NOT NULL, season INTEGER NOT NULL, week INTEGER NOT NULL,
  forecast_at INTEGER NOT NULL, kickoff INTEGER NOT NULL,
  espn REAL, baseline REAL, estimate REAL NOT NULL, actual REAL, settled_at INTEGER,
  PRIMARY KEY(scope,player_id,season,week)
);
