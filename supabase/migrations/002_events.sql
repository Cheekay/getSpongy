CREATE TYPE event_state  AS ENUM ('draft', 'published', 'live', 'ended', 'archived');
CREATE TYPE rsvp_type    AS ENUM ('free', 'paid');
CREATE TYPE privacy_type AS ENUM ('public', 'unlisted', 'private');

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dj_id           UUID REFERENCES users(id),
  title           TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  venue_name      TEXT,
  venue_lat       DECIMAL(10, 8),
  venue_lng       DECIMAL(11, 8),
  privacy         privacy_type NOT NULL DEFAULT 'public',
  state           event_state  NOT NULL DEFAULT 'draft',
  rsvp_type       rsvp_type    NOT NULL DEFAULT 'free',
  capacity        INTEGER,
  event_code      TEXT UNIQUE NOT NULL,
  qr_secret       TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_tiers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  inventory  INTEGER,
  sold_count INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_public_read"   ON events FOR SELECT USING (privacy = 'public' AND state != 'draft');
CREATE POLICY "events_organizer_all" ON events FOR ALL    USING (auth.uid() = organizer_id);
CREATE POLICY "events_dj_read"       ON events FOR SELECT USING (auth.uid() = dj_id);

CREATE POLICY "ticket_tiers_public_read" ON ticket_tiers FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = ticket_tiers.event_id AND events.privacy = 'public')
);
CREATE POLICY "ticket_tiers_organizer_all" ON ticket_tiers FOR ALL USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = ticket_tiers.event_id AND events.organizer_id = auth.uid())
);
