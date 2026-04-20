'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function toggleUpvote(
  requestId: string
): Promise<{ voted?: boolean; count?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('song_requests')
    .select('state, event_id, upvote_count')
    .eq('id', requestId)
    .single()

  if (!request) return { error: 'Request not found' }
  if (request.state !== 'pending') return { error: 'Can only upvote pending requests' }

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('status')
    .eq('event_id', request.event_id)
    .eq('user_id', user.id)
    .single()

  if (rsvp?.status !== 'checked_in') return { error: 'Must be checked in to upvote' }

  const { data: existing } = await supabase
    .from('upvotes')
    .select('id')
    .eq('request_id', requestId)
    .eq('user_id', user.id)
    .maybeSingle()

  const admin = createServiceClient()

  if (existing) {
    await admin.from('upvotes').delete().eq('id', existing.id)
    const newCount = Math.max(0, (request.upvote_count ?? 0) - 1)
    await admin.from('song_requests').update({ upvote_count: newCount }).eq('id', requestId)
    return { voted: false, count: newCount }
  } else {
    await admin.from('upvotes').insert({ request_id: requestId, user_id: user.id })
    const newCount = (request.upvote_count ?? 0) + 1
    await admin.from('song_requests').update({ upvote_count: newCount }).eq('id', requestId)
    return { voted: true, count: newCount }
  }
}
