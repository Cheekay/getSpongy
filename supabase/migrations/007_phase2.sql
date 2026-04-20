-- Add pause controls to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS requests_paused        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requests_paused_until  TIMESTAMPTZ;

-- DJ can read requests for their events (needed for realtime dashboard)
CREATE POLICY "requests_dj_read" ON song_requests FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = song_requests.event_id
      AND events.dj_id = auth.uid()
  )
);

-- Organizer can read requests for their events
CREATE POLICY "requests_organizer_read" ON song_requests FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = song_requests.event_id
      AND events.organizer_id = auth.uid()
  )
);

-- Organizer can update (moderate) requests for their events
CREATE POLICY "requests_organizer_update" ON song_requests FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM events
    WHERE events.id = song_requests.event_id
      AND events.organizer_id = auth.uid()
  )
);

-- RSVPd attendees can read events they RSVPd to (needed for /live page and paused check)
CREATE POLICY "events_rsvpd_read" ON events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM rsvps
    WHERE rsvps.event_id = events.id
      AND rsvps.user_id = auth.uid()
      AND rsvps.status != 'cancelled'
  )
);
