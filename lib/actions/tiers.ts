'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function createTier(
  eventId: string,
  params: { name: string; priceCents: number; inventory: number | null }
): Promise<{ tierId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('organizer_id')
    .eq('id', eventId)
    .eq('organizer_id', user.id)
    .single()

  if (eventError || !event) return { error: 'Event not found or not authorized' }

  const admin = createServiceClient()
  const { data: tier, error } = await admin
    .from('ticket_tiers')
    .insert({ event_id: eventId, name: params.name, price_cents: params.priceCents, inventory: params.inventory })
    .select('id')
    .single()

  if (error || !tier) return { error: error?.message || 'Failed to create tier' }
  revalidatePath(`/manage/events/${eventId}/tiers`)
  return { tierId: tier.id }
}

export async function updateTier(
  tierId: string,
  patch: { name?: string; priceCents?: number; inventory?: number | null; active?: boolean }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: tier } = await supabase
    .from('ticket_tiers')
    .select('event_id, event:events!inner(organizer_id)')
    .eq('id', tierId)
    .single()

  const eventData = tier?.event as { organizer_id: string } | null
  if (!tier || eventData?.organizer_id !== user.id) return { error: 'Not authorized' }

  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.priceCents !== undefined) update.price_cents = patch.priceCents
  if (patch.inventory !== undefined) update.inventory = patch.inventory
  if (patch.active !== undefined) update.active = patch.active

  const { error } = await supabase.from('ticket_tiers').update(update).eq('id', tierId)
  if (error) return { error: error.message }

  revalidatePath(`/manage/events/${tier.event_id}/tiers`)
  return {}
}

export async function deleteTier(tierId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: tier } = await supabase
    .from('ticket_tiers')
    .select('sold_count, event_id, event:events!inner(organizer_id)')
    .eq('id', tierId)
    .single()

  const eventData = tier?.event as { organizer_id: string } | null
  if (!tier || eventData?.organizer_id !== user.id) return { error: 'Not authorized' }
  if ((tier.sold_count ?? 0) > 0) return { error: 'Cannot delete a tier with sold tickets' }

  const { error } = await supabase.from('ticket_tiers').delete().eq('id', tierId)
  if (error) return { error: error.message }

  revalidatePath(`/manage/events/${tier.event_id}/tiers`)
  return {}
}
