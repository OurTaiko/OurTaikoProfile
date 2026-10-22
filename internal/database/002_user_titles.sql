-- Titles players make for their own 段位 courses (website /titles). owner_id is the player who
-- made it; the titles administrators keep have none. A player holds at most five community
-- titles; one an administrator makes official no longer counts against them.
ALTER TABLE titles ADD COLUMN owner_id text CHECK (owner_id ~ '^[0-9a-f]{32}$');
CREATE INDEX titles_owner ON titles (owner_id) WHERE owner_id IS NOT NULL;

INSERT INTO internal.schema_migrations (version) VALUES (2);
