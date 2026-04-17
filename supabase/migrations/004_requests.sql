CREATE TYPE request_state AS ENUM ('pending', 'accepted', 'rejected', 'played', 'expired', 'withdrawn');

CREATE TABLE song_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spotify_track_id TEXT NOT NULL,
  track_title      TEXT NOT NULL,
  track_artist     TEXT NOT NULL,
  album_art_url    TEXT,
  shoutout_text    TEXT CHECK (char_length(shoutout_text) <= 140),
  state            request_state NOT NULL DEFAULT 'pending',
  upvote_count     INTEGER NOT NULL DEFAULT 0,
  tip_cents        INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upvotes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES song_requests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, user_id)
);

CREATE TABLE moderation_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  target_type   TEXT NOT NULL CHECK (target_type IN ('user', 'request')),
  target_id     UUID NOT NULL,
  action        TEXT NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE song_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE upvotes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_read_rsvpd" ON song_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM rsvps WHERE rsvps.event_id = song_requests.event_id AND rsvps.user_id = auth.uid())
);
CREATE POLICY "requests_create_own" ON song_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "requests_update_own" ON song_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "requests_dj_update"  ON song_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = song_requests.event_id AND events.dj_id = auth.uid())
);

CREATE POLICY "upvotes_read_all"   ON upvotes FOR SELECT USING (true);
CREATE POLICY "upvotes_create_own" ON upvotes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "upvotes_delete_own" ON upvotes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "moderation_dj_insert" ON moderation_actions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM events WHERE events.id = moderation_actions.event_id AND events.dj_id = auth.uid())
);
