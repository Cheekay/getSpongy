-- Allow public read of user display names (needed for event page organizer join)
CREATE POLICY "users_public_name_read" ON users FOR SELECT USING (true);
