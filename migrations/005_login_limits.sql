CREATE TABLE IF NOT EXISTS login_limits (
 key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start BIGINT NOT NULL, blocked_until BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_login_limits_window ON login_limits(window_start);
