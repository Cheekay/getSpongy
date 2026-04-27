'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushNotification } from '@/lib/notifications'

export async function joinWaitlist(params: {
  eventId: string
  tierId?: string
}): Promise<{ position?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  const { data: maxRow } = await admin
    .from('waitlist')
    .select('position')
    .eq('event_id', params.eventId)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const nextPosition = (maxRow?.position ?? 0) + 1

  const { data: entry, error } = await admin
    .from('waitlist')
    .insert({
      event_id: params.eventId,
      user_id: user.id,
      tier_id: params.tierId ?? null,
      position: nextPosition,
    })
    .select('position')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Already on waitlist for this event' }
    return { error: error.message }
  }

  return { position: entry.position }
}

export async function leaveWaitlist(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin
    .from('waitlist')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function notifyWaitlist(eventId: string, tierId?: string): Promise<void> {
  const admin = createServiceClient()

  const query = admin
    .from('waitlist')
    .select('id, user_id, position')
    .eq('event_id', eventId)
    .is('notified_at', null)
    .order('position', { ascending: true })
    .limit(1)

  if (tierId) (query as any).eq('tier_id', tierId)

  const { data: entry } = await query.single()
  if (!entry) return

  await admin.from('waitlist').update({ notified_at: new Date().toISOString() }).eq('id', entry.id)

  const { data: event } = await admin
    .from('events')
    .select('title')
    .eq('id', eventId)
    .single()

  await sendPushNotification(
    entry.user_id,
    'Spot available!',
    `A spot just opened up${event?.title ? ` for "${event.title}"` : ''}. Claim it before it's gone.`,
    { eventId, type: 'waitlist' }
  )
}
