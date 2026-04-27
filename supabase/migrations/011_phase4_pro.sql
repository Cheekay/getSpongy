-- supabase/migrations/011_phase4_pro.sql

-- Subscription state on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
  ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brand_logo_url           TEXT,
  ADD COLUMN IF NOT EXISTS brand_accent_color       TEXT,
  ADD COLUMN IF NOT EXISTS brand_hide_watermark     BOOLEAN NOT NULL DEFAULT FALSE;

-- Team members scoped per organizer account
CREATE TABLE IF NOT EXISTS team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_phone   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('co_organizer', 'door_staff')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at     TIMESTAMPTZ,
  UNIQUE(organizer_id, invited_phone)
);

-- RLS: organizer reads their own team
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_organizer_all" ON team_members
  USING (organizer_id = auth.uid());

-- door_staff read access to rsvps for their organizer's events
CREATE POLICY "rsvps_team_read" ON rsvps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN events e ON e.organizer_id = tm.organizer_id
      WHERE tm.member_user_id = auth.uid()
        AND tm.status = 'accepted'
        AND e.id = rsvps.event_id
    )
  );
