'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { verifyQrJwt } from '@/lib/jwt'
import { isDuplicateCheckIn } from '@/lib/utils'

export type GuestRow = {
  id: string
  status: string
  checked_in_at: string | null
  user: { name: string; phone: string }
}

export async function getGuestList(eventId: string): Promise<{
  guests?: GuestRow[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: event } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .single()

  if (!event || event.organizer_id !== user.id) return { error: 'Access denied' }

  const { data: rsvps, error } = await supabase
    .from('rsvps')
    .select('id, status, checked_in_at, user:users!user_id(name, phone)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .order('status', { ascending: true })

  if (error) return { error: error.message }
  return { guests: (rsvps ?? []) as unknown as GuestRow[] }
}

export async function checkInGuest(rsvpId: string): Promise<{
  duplicate?: boolean
  checkedInAt?: string
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('id, status, event_id')
    .eq('id', rsvpId)
    .single()

  if (!rsvp) return { error: 'RSVP not found' }
  if (isDuplicateCheckIn(rsvp.status)) return { duplicate: true }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rsvps')
    .update({ status: 'checked_in', checked_in_at: now })
    .eq('id', rsvpId)

  if (error) return { error: error.message }
  revalidatePath(`/events/${rsvp.event_id}/door`)
  return { checkedInAt: now }
}

export async function verifyAndCheckIn(qrJwt: string): Promise<{
  duplicate?: boolean
  checkedInAt?: string
  error?: string
}> {
  let payload: { rsvpId: string }
  try {
    payload = await verifyQrJwt(qrJwt)
  } catch {
    return { error: 'Invalid QR code' }
  }

  return checkInGuest(payload.rsvpId)
}
