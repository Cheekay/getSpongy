'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export type ModerateAction = 'accepted' | 'rejected' | 'played'

type RequestRow = { id: string; event_id: string; state: string }
type EventRow = { dj_id: string | null; organizer_id: string }

type LoadContext =
  | { error: string }
  | { user: { id: string }; request: RequestRow; event: EventRow }

async function loadRequestAndEvent(requestId: string): Promise<LoadContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('song_requests')
    .select('id, event_id, state')
    .eq('id', requestId)
    .single()
  if (!request) return { error: 'Request not found' }

  const { data: event } = await supabase
    .from('events')
    .select('dj_id, organizer_id')
    .eq('id', (request as RequestRow).event_id)
    .single()
  if (!event) return { error: 'Event not found' }

  if (
    (event as EventRow).dj_id !== user.id &&
    (event as EventRow).organizer_id !== user.id
  ) {
    return { error: 'Not authorized' }
  }

  return {
    user,
    request: request as RequestRow,
    event: event as EventRow,
  }
}

export async function moderateRequest(
  requestId: string,
  action: ModerateAction
): Promise<{ error?: string }> {
  const ctx = await loadRequestAndEvent(requestId)
  if ('error' in ctx) return { error: ctx.error }

  const { request } = ctx

  if (action === 'accepted' && request.state !== 'pending') {
    return { error: 'Can only accept pending requests' }
  }
  if (action === 'played' && request.state !== 'accepted') {
    return { error: 'Can only mark accepted requests as played' }
  }
  if (action === 'rejected' && !['pending', 'accepted'].includes(request.state)) {
    return { error: 'Cannot reject this request' }
  }

  const admin = createServiceClient()
  const { error } = await admin
    .from('song_requests')
    .update({ state: action, state_changed_at: new Date().toISOString() })
    .eq('id', requestId)

  return { error: error?.message }
}

export async function revertRequest(requestId: string): Promise<{ error?: string }> {
  const ctx = await loadRequestAndEvent(requestId)
  if ('error' in ctx) return { error: ctx.error }

  const { request } = ctx
  if (!['accepted', 'rejected'].includes(request.state)) {
    return { error: 'Can only revert accepted or rejected requests' }
  }

  const admin = createServiceClient()
  const { error } = await admin
    .from('song_requests')
    .update({ state: 'pending', state_changed_at: new Date().toISOString() })
    .eq('id', requestId)

  return { error: error?.message }
}

export async function pauseRequests(
  eventId: string,
  paused: boolean,
  pausedUntil?: Date
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('dj_id, organizer_id')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }

  const ev = event as EventRow
  if (ev.dj_id !== user.id && ev.organizer_id !== user.id) {
    return { error: 'Not authorized' }
  }

  const admin = createServiceClient()
  const { error } = await admin
    .from('events')
    .update({
      requests_paused: paused,
      requests_paused_until: paused && pausedUntil ? pausedUntil.toISOString() : null,
    })
    .eq('id', eventId)

  return { error: error?.message }
}

export async function assignDj(
  eventId: string,
  djPhone: string
): Promise<{ error?: string; djName?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()
  if (!event || (event as { organizer_id: string }).organizer_id !== user.id) {
    return { error: 'Not authorized' }
  }

  const admin = createServiceClient()
  const { data: djUser } = await admin
    .from('users')
    .select('id, name')
    .eq('phone', djPhone)
    .single()
  if (!djUser) return { error: 'No account found with that phone number' }

  const { error } = await admin
    .from('events')
    .update({ dj_id: (djUser as { id: string; name: string }).id })
    .eq('id', eventId)

  return {
    error: error?.message,
    djName: (djUser as { id: string; name: string }).name,
  }
}
