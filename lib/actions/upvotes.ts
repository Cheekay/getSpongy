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
    const { error: delError } = await admin.from('upvotes').delete().eq('id', existing.id)
    if (delError) return { error: delError.message }
    const { data: newCount, error: rpcError } = await admin.rpc('adjust_upvote_count', { p_request_id: requestId, p_delta: -1 })
    if (rpcError) return { error: rpcError.message }
    return { voted: false, count: newCount ?? 0 }
  } else {
    const { error: insError } = await admin.from('upvotes').insert({ request_id: requestId, user_id: user.id })
    if (insError) return { error: insError.message }
    const { data: newCount, error: rpcError } = await admin.rpc('adjust_upvote_count', { p_request_id: requestId, p_delta: 1 })
    if (rpcError) return { error: rpcError.message }
    return { voted: true, count: newCount ?? 0 }
  }
}
