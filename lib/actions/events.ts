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
