-- Live request feed (most critical query in the app)
CREATE INDEX idx_song_requests_event_state_created
  ON song_requests(event_id, state, created_at DESC);

-- Door scanner check-in lookup
CREATE INDEX idx_rsvps_event_status
  ON rsvps(event_id, status);

-- Upvote uniqueness (already enforced by UNIQUE constraint; explicit index for perf)
CREATE UNIQUE INDEX idx_upvotes_request_user
  ON upvotes(request_id, user_id);

-- Event discovery feed
CREATE INDEX idx_events_state_start
  ON events(state, start_at);

-- QR / 6-digit code entry
CREATE UNIQUE INDEX idx_events_code
  ON events(event_code);

-- Auth phone lookup
CREATE UNIQUE INDEX idx_users_phone
  ON users(phone);
