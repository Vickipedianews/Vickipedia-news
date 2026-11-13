CREATE INDEX IF NOT EXISTS idx_articles_status_published ON articles(status,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category_status ON articles(category_id,status,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_authors_author ON article_authors(author_id,position);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
