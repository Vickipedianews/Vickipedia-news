-- Preserve legacy lead author assignments when upgrading existing databases.
INSERT INTO article_authors(article_id,author_id,position)
SELECT a.id,a.author_id,0 FROM articles a WHERE a.author_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM article_authors aa WHERE aa.article_id=a.id)
ON CONFLICT DO NOTHING;
