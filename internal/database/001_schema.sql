-- OurTaikoProfile: website sessions and what a player holds across the OurTaiko services:
-- titles, 段位 badges, the nameplate they wear and the record of every award. Scores are
-- not kept here; they stay with the service they were played on.
CREATE SCHEMA IF NOT EXISTS internal;
CREATE TABLE internal.schema_migrations (
  version int PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Website sign-in through the account center (OIDC), as on Fanmade and OurTaikoDatabase.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL CHECK (user_id ~ '^[0-9a-f]{32}$'),
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  upstream_token bytea NOT NULL,
  upstream_refresh_token bytea,
  upstream_expires_at timestamptz
);
CREATE INDEX sessions_expires ON sessions (expires_at);
CREATE TABLE oidc_flows (
  state_hash text PRIMARY KEY,
  binding_hash text NOT NULL,
  nonce text NOT NULL,
  verifier text NOT NULL,
  return_path text NOT NULL,
  expires_at timestamptz NOT NULL
);

-- Services that may ask for awards (POST /internal/v1/awards): one key each, kept as a hash.
CREATE TABLE services (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  key_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Titles. style names the game's built-in title band (frame_top 0–4 and the rainbow band).
-- official: granted for official content; community titles say so wherever they are shown.
CREATE TABLE titles (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  name_translations jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(name_translations) = 'object'),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  style text NOT NULL CHECK (style IN ('wood', 'teal', 'wood2', 'purple', 'gold', 'rainbow')),
  official boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every award asked for, once per (service, request_key): a 段位 attempt of a service, or a
-- grant by a Profile administrator (service 'admin'). granted records what it actually gave.
CREATE TABLE awards (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service text NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 100),
  user_id text NOT NULL CHECK (user_id ~ '^[0-9a-f]{32}$'),
  course_id text NOT NULL DEFAULT '',
  course_title text NOT NULL DEFAULT '',
  official boolean NOT NULL DEFAULT false,
  verdict smallint NOT NULL DEFAULT 0 CHECK (verdict BETWEEN 0 AND 6),
  dan smallint CHECK (dan BETWEEN 0 AND 24),
  granted jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service, request_key)
);
CREATE INDEX awards_user ON awards (user_id, created_at DESC);

CREATE TABLE user_titles (
  user_id text NOT NULL CHECK (user_id ~ '^[0-9a-f]{32}$'),
  title_id text NOT NULL REFERENCES titles (id) ON DELETE CASCADE,
  award_id bigint REFERENCES awards (id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);

-- The best result of each 段位 (0 初級 .. 24 達人) from official courses: verdict 1–3 is a red
-- pass, 4–6 a gold one. It only ever goes up.
CREATE TABLE user_dans (
  user_id text NOT NULL CHECK (user_id ~ '^[0-9a-f]{32}$'),
  dan smallint NOT NULL CHECK (dan BETWEEN 0 AND 24),
  verdict smallint NOT NULL CHECK (verdict BETWEEN 1 AND 6),
  award_id bigint REFERENCES awards (id) ON DELETE SET NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dan)
);

-- What a player wears: one of their titles (or none) and whether the highest 段位 shows.
CREATE TABLE nameplates (
  user_id text PRIMARY KEY CHECK (user_id ~ '^[0-9a-f]{32}$'),
  title_id text REFERENCES titles (id) ON DELETE SET NULL,
  show_dan boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO internal.schema_migrations (version) VALUES (1);
