'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { signQrJwt, isQrJwtNearExpiry } from '@/lib/jwt'
import { revalidatePath } from 'next/cache'

export function isEventAtCapacity(capacity: number | null, rsvpCount: number): boolean {
  if (capacity === null) return false
  return rsvpCount >= capacity
}

export async function rsvpToEvent(eventId: string): Promise<{
  error?: string
  rsvpId?: string
  qrJwt?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const [eventResult, countResult, existingResult] = await Promise.all([
    supabase.from('events').select('id, capacity, state').eq('id', eventId).single(),
    supabase.from('rsvps').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).neq('status', 'cancelled'),
    supabase.from('rsvps').select('id, qr_jwt').eq('event_id', eventId).eq('user_id', user.id).single(),
  ])

  if (eventResult.error || !eventResult.data) return { error: 'Event not found' }

  if (existingResult.data) {
    let qrJwt = existingResult.data.qr_jwt as string
    if (!qrJwt || isQrJwtNearExpiry(qrJwt)) {
      qrJwt = await refreshQrJwt(existingResult.data.id)
    }
    return { rsvpId: existingResult.data.id, qrJwt }
  }

  if (isEventAtCapacity(eventResult.data.capacity, countResult.count ?? 0)) {
    return { error: 'This event is full' }
  }

  const admin = createServiceClient()
  const { data: rsvp, error: insertError } = await admin
    .from('rsvps')
    .insert({ event_id: eventId, user_id: user.id, status: 'rsvpd' })
    .select('id')
    .single()

  if (insertError || !rsvp) return { error: insertError?.message || 'Failed to RSVP' }

  const qrJwt = await signQrJwt({ rsvpId: rsvp.id, eventId, userId: user.id })

  await admin.from('rsvps').update({ qr_jwt: qrJwt }).eq('id', rsvp.id)

  revalidatePath(`/e/${eventId}`)
  return { rsvpId: rsvp.id, qrJwt }
}

export async function refreshQrJwt(rsvpId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('id, event_id, user_id')
    .eq('id', rsvpId)
    .single()
  if (!rsvp) throw new Error('RSVP not found')

  const qrJwt = await signQrJwt({ rsvpId: rsvp.id, eventId: rsvp.event_id, userId: rsvp.user_id })
  const admin = createServiceClient()
  await admin.from('rsvps').update({ qr_jwt: qrJwt }).eq('id', rsvpId)
  return qrJwt
}
