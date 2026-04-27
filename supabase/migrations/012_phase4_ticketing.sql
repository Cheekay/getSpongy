-- supabase/migrations/012_phase4_ticketing.sql

-- Attendees waiting for a sold-out ticket tier
CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id     UUID REFERENCES ticket_tiers(id),
  position    INTEGER NOT NULL,
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_own_read" ON waitlist FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "waitlist_own_insert" ON waitlist FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "waitlist_own_delete" ON waitlist FOR DELETE
  USING (user_id = auth.uid());

-- Ticket transfers (JWT one-time claim links)
CREATE TABLE IF NOT EXISTS ticket_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id         UUID NOT NULL REFERENCES rsvps(id),
  from_user_id    UUID NOT NULL REFERENCES users(id),
  recipient_phone TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  expires_at      TIMESTAMPTZ NOT NULL,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfers_from_user_read" ON ticket_transfers FOR SELECT
  USING (from_user_id = auth.uid());

-- Organizer-approved refund requests
CREATE TABLE IF NOT EXISTS refund_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id          UUID NOT NULL REFERENCES rsvps(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  reason           TEXT NOT NULL,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'denied')),
  stripe_refund_id TEXT,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_requests_own_read" ON refund_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "refund_requests_own_insert" ON refund_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Add 'transferred' to valid rsvps status values
-- Postgres CHECK constraint must be dropped and re-added
DO $$
BEGIN
  -- Remove the old check constraint if it exists
  ALTER TABLE rsvps DROP CONSTRAINT IF EXISTS rsvps_status_check;
  -- Re-add including 'transferred'
  ALTER TABLE rsvps ADD CONSTRAINT rsvps_status_check
    CHECK (status IN ('rsvpd', 'paid', 'checked_in', 'refunded', 'cancelled', 'transferred'));
END $$;
