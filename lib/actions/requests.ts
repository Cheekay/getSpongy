'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { containsProfanity } from '@/lib/profanity'

const RATE_LIMIT_MINUTES = 10

export type SubmitRequestResult = {
  error?: string
  requestId?: string
  retryAfterSeconds?: number
}

export async function submitRequest(params: {
  eventId: string
  spotifyTrackId: string
  trackTitle: string
  trackArtist: string
  albumArtUrl: string | null
  shoutoutText?: string
}): Promise<SubmitRequestResult> {
  const { eventId, spotifyTrackId, trackTitle, trackArtist, albumArtUrl, shoutoutText } = params

  // Profanity check before any DB calls
  if (shoutoutText && containsProfanity(shoutoutText)) {
    return { error: 'Shoutout contains inappropriate language' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Event state check
  const { data: event } = await supabase
    .from('events')
    .select('state, requests_paused, requests_paused_until')
    .eq('id', eventId)
    .single()

  if (!event || event.state !== 'live') return { error: 'Event is not live' }

  if (event.requests_paused) {
    const eta = event.requests_paused_until
      ? Math.ceil((new Date(event.requests_paused_until).getTime() - Date.now()) / 1000)
      : null
    return { error: 'DJ is focused right now', retryAfterSeconds: eta ?? undefined }
  }

  // Must have RSVP to submit
  const { count: rsvpCount } = await supabase
    .from('rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
  if (!rsvpCount) return { error: 'You must RSVP before submitting requests' }

  // Rate limit: 1 request per RATE_LIMIT_MINUTES per user per event
  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString()
  const { count: recentCount } = await supabase
    .from('song_requests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .gte('created_at', cutoff)

  if ((recentCount ?? 0) > 0) {
    const { data: latest } = await supabase
      .from('song_requests')
      .select('created_at')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const elapsed = latest ? (Date.now() - new Date(latest.created_at).getTime()) / 1000 : 0
    return {
      error: 'Please wait before submitting another request',
      retryAfterSeconds: Math.ceil(RATE_LIMIT_MINUTES * 60 - elapsed),
    }
  }

  // Duplicate suppression: same track already pending or accepted
  const { count: dupCount } = await supabase
    .from('song_requests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('spotify_track_id', spotifyTrackId)
    .in('state', ['pending', 'accepted'])

  if ((dupCount ?? 0) > 0) return { error: 'This song is already in the queue' }

  const admin = createServiceClient()
  const { data: request, error: insertError } = await admin
    .from('song_requests')
    .insert({
      event_id: eventId,
      user_id: user.id,
      spotify_track_id: spotifyTrackId,
      track_title: trackTitle,
      track_artist: trackArtist,
      album_art_url: albumArtUrl,
      shoutout_text: shoutoutText ?? null,
      state: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !request) return { error: insertError?.message || 'Failed to submit request' }
  return { requestId: request.id }
}

export async function withdrawRequest(requestId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('song_requests')
    .update({ state: 'withdrawn', state_changed_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('user_id', user.id)
    .in('state', ['pending'])

  return { error: error?.message }
}
