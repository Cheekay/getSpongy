CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  role_flags JSONB NOT NULL DEFAULT '{"attendee": true, "dj": false, "organizer": false}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizer_profiles (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name             TEXT NOT NULL,
  bio                      TEXT,
  stripe_connect_account_id TEXT,
  payout_status            TEXT DEFAULT 'pending',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dj_profiles (
  user_id                      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stage_name                   TEXT NOT NULL,
  bio                          TEXT,
  instagram_handle             TEXT,
  default_moderation_settings  JSONB NOT NULL DEFAULT '{
    "rate_limit_minutes": 10,
    "duplicate_suppression": true,
    "profanity_filter": true,
    "upvoting_enabled": true,
    "queue_capacity": 20
  }',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dj_profiles        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own"    ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own"  ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "organizer_profiles_own" ON organizer_profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "dj_profiles_own"         ON dj_profiles FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "dj_profiles_public_read" ON dj_profiles FOR SELECT USING (true);
