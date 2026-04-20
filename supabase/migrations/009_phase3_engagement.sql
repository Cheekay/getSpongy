-- supabase/migrations/009_phase3_engagement.sql
-- Adds atomic upvote counter adjustment function.
-- upvotes table and upvote_count column already exist (004_requests.sql).

CREATE OR REPLACE FUNCTION adjust_upvote_count(p_request_id uuid, p_delta int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE song_requests
  SET upvote_count = GREATEST(0, upvote_count + p_delta)
  WHERE id = p_request_id
  RETURNING upvote_count INTO new_count;
  RETURN new_count;
END;
$$;
