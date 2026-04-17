CREATE TYPE rsvp_status AS ENUM ('rsvpd', 'paid', 'checked_in', 'refunded', 'cancelled');

CREATE TABLE rsvps (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id                  UUID REFERENCES ticket_tiers(id),
  status                   rsvp_status NOT NULL DEFAULT 'rsvpd',
  qr_jwt                   TEXT,
  price_paid_cents         INTEGER NOT NULL DEFAULT 0,
  stripe_payment_intent_id TEXT,
  rsvpd_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_at            TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rsvps_own_read"       ON rsvps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rsvps_own_insert"     ON rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rsvps_organizer_read" ON rsvps FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = rsvps.event_id AND events.organizer_id = auth.uid())
);
CREATE POLICY "rsvps_organizer_checkin" ON rsvps FOR UPDATE USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = rsvps.event_id AND events.organizer_id = auth.uid())
);
