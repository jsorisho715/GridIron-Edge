CREATE TABLE IF NOT EXISTS ge_advisor_config (
 id INTEGER PRIMARY KEY CHECK(id=1), envelope TEXT, enabled INTEGER NOT NULL DEFAULT 0,
 risk TEXT NOT NULL DEFAULT 'balanced', revision TEXT NOT NULL DEFAULT 'initial',
 last_attempt INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, error TEXT
);
INSERT OR IGNORE INTO ge_advisor_config(id) VALUES(1);
CREATE TABLE IF NOT EXISTS ge_decision_sets (
 scope TEXT PRIMARY KEY, evidence_key TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ge_decision_memory (
 scope TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('approved','declined','completed')),
 updated_at INTEGER NOT NULL, PRIMARY KEY(scope,id,fingerprint)
);
CREATE TABLE IF NOT EXISTS ge_ai_reviews (
 scope TEXT NOT NULL, fingerprint TEXT NOT NULL, review TEXT NOT NULL,
 created_at INTEGER NOT NULL, PRIMARY KEY(scope,fingerprint)
);
CREATE TABLE IF NOT EXISTS ge_ai_usage (
 day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0,
 reserved_tokens INTEGER NOT NULL DEFAULT 0, actual_tokens INTEGER NOT NULL DEFAULT 0
);
