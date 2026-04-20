-- supabase/migrations/009_phase3_engagement.sql
-- Adds atomic upvote counter adjustment and trigger.
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

CREATE OR REPLACE FUNCTION trigger_adjust_upvote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE song_requests
    SET upvote_count = GREATEST(0, upvote_count + 1)
    WHERE id = NEW.request_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE song_requests
    SET upvote_count = GREATEST(0, upvote_count - 1)
    WHERE id = OLD.request_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER upvotes_adjust_count
AFTER INSERT OR DELETE ON upvotes
FOR EACH ROW EXECUTE FUNCTION trigger_adjust_upvote_count();
