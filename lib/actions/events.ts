'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function goLive(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('events')
    .update({ state: 'live' })
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .eq('state', 'published')

  if (error) return { error: error.message }
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  return {}
}

export async function endEvent(eventId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('events')
    .update({ state: 'ended' })
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .eq('state', 'live')

  if (error) return { error: error.message }
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  return {}
}

export async function autoFlipEvents(): Promise<void> {
  const admin = createServiceClient()
  await admin
    .from('events')
    .update({ state: 'live' })
    .eq('state', 'published')
    .lte('start_at', new Date().toISOString())
}

export type PublishEventResult = {
  error?: string
  requiresStripe?: boolean
}

export async function publishEvent(eventId: string): Promise<PublishEventResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: event } = await supabase
    .from('events')
    .select('rsvp_type, state, organizer_id')
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .single()

  if (!event) return { error: 'Event not found' }

  if (event.rsvp_type === 'paid') {
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_connect_onboarded')
      .eq('id', user.id)
      .single()

    if (!userData?.stripe_connect_onboarded) {
      return { error: 'Connect Stripe to publish paid events', requiresStripe: true }
    }
  }

  const { error } = await supabase
    .from('events')
    .update({ state: 'published' })
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .eq('state', 'draft')

  if (error) return { error: error.message }
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  return {}
}

export async function updateTipSettings(
  eventId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: event } = await supabase
    .from('events')
    .select('state, organizer_id')
    .eq('id', eventId)
    .single()

  if (!event || event.organizer_id !== user.id) return { error: 'Not found' }
  if (['live', 'ended'].includes(event.state)) return { error: 'Cannot change tip settings after going live' }

  const tipsEnabled = formData.get('tipsEnabled') === 'on'
  const minTipCents = Math.max(100, parseInt(formData.get('minTipCents') as string, 10) || 100)

  const { error } = await supabase
    .from('events')
    .update({ tips_enabled: tipsEnabled, min_tip_cents: minTipCents })
    .eq('id', eventId)
    .eq('organizer_id', user.id)

  if (error) return { error: error.message }
  revalidatePath(`/events/${eventId}`)
  return {}
}
