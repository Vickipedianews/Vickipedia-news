-- Databases created before contributor profiles existed still have an authors
-- table without portrait or social columns. Migration 001 uses
-- CREATE TABLE IF NOT EXISTS, which never alters an existing table, so those
-- installs need the missing columns added explicitly.
ALTER TABLE authors ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE authors ADD COLUMN IF NOT EXISTS social TEXT NOT NULL DEFAULT '';
