-- Fix infinite recursion between events_rsvpd_read and rsvps_organizer_read policies.
-- Each policy queried the other table, causing a circular RLS loop (PG error 42P17).
-- Solution: SECURITY DEFINER helper functions that bypass RLS for the inner lookup.

DROP POLICY IF EXISTS "rsvps_organizer_read" ON rsvps;
DROP POLICY IF EXISTS "events_rsvpd_read" ON events;

CREATE OR REPLACE FUNCTION auth_is_event_organizer(p_event_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM events WHERE id = p_event_id AND organizer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION auth_has_active_rsvp(p_event_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM rsvps WHERE event_id = p_event_id AND user_id = auth.uid() AND status != 'cancelled'
  );
$$;

CREATE POLICY "rsvps_organizer_read" ON rsvps FOR SELECT
  USING (auth_is_event_organizer(event_id));

CREATE POLICY "events_rsvpd_read" ON events FOR SELECT
  USING (auth_has_active_rsvp(id));
