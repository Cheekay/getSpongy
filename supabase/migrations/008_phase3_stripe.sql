-- supabase/migrations/008_phase3_stripe.sql
ALTER TABLE users
  ADD COLUMN stripe_connect_account_id TEXT,
  ADD COLUMN stripe_connect_onboarded  BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE events
  ADD COLUMN tips_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN min_tip_cents  INTEGER NOT NULL DEFAULT 100;
