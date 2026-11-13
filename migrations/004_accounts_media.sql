-- Author accounts are linked to public contributor profiles. Privileges are checked in the API.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE users ADD COLUMN IF NOT EXISTS author_id BIGINT REFERENCES authors(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_author_id_unique ON users(author_id) WHERE author_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS media_assets(
 id BIGSERIAL PRIMARY KEY, url TEXT NOT NULL UNIQUE, filename TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL DEFAULT '', alt TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL,
 bytes BIGINT NOT NULL DEFAULT 0, provider TEXT NOT NULL DEFAULT 'vercel-blob',
 uploaded_by BIGINT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(mime_type,created_at DESC);
