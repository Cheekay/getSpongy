CREATE TABLE event_analytics_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE event_analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_organizer_read" ON event_analytics_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = event_analytics_snapshots.event_id AND events.organizer_id = auth.uid())
);
CREATE POLICY "analytics_dj_read" ON event_analytics_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM events WHERE events.id = event_analytics_snapshots.event_id AND events.dj_id = auth.uid())
);
