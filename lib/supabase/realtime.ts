import { createClient } from './client'

export type RequestState =
  | 'pending' | 'accepted' | 'rejected'
  | 'played'  | 'expired'  | 'withdrawn'

export type RequestPayload = {
  id: string
  event_id: string
  user_id: string
  spotify_track_id: string
  track_title: string
  track_artist: string
  album_art_url: string | null
  shoutout_text: string | null
  state: RequestState
  upvote_count: number
  tip_cents: number
  created_at: string
  state_changed_at: string
}

export type CheckInStatus = 'rsvpd' | 'paid' | 'checked_in' | 'refunded' | 'cancelled'

export type CheckInPayload = {
  id: string
  event_id: string
  user_id: string
  status: CheckInStatus
  checked_in_at: string | null
}

export function subscribeToRequests(
  eventId: string,
  onUpdate: (payload: RequestPayload) => void
): () => void {
  const supabase = createClient()
  const channel = supabase
    .channel(`requests:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'song_requests',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => onUpdate(payload.new as RequestPayload)
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

export function subscribeToCheckIns(
  eventId: string,
  onUpdate: (payload: CheckInPayload) => void
): () => void {
  const supabase = createClient()
  const channel = supabase
    .channel(`checkins:${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rsvps',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => onUpdate(payload.new as CheckInPayload)
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
