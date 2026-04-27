'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'

export async function submitTip(params: {
  requestId: string
  amountCents: number
  note?: string
}): Promise<{ clientSecret?: string; error?: string }> {
  const { requestId, amountCents, note } = params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('song_requests')
    .select('state, event_id')
    .eq('id', requestId)
    .single()

  if (!request) return { error: 'Request not found' }
  if (request.state !== 'pending') return { error: 'Can only tip pending requests' }

  const { data: event } = await supabase
    .from('events')
    .select('tips_enabled, min_tip_cents, organizer_id, dj_id')
    .eq('id', request.event_id)
    .single()

  if (!event?.tips_enabled) return { error: 'Tips are not enabled for this event' }
  if (amountCents < (event.min_tip_cents ?? 100)) {
    return { error: `Amount below minimum tip of $${((event.min_tip_cents ?? 100) / 100).toFixed(2)}` }
  }

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('status')
    .eq('event_id', request.event_id)
    .eq('user_id', user.id)
    .single()

  if (rsvp?.status !== 'checked_in') return { error: 'Must be checked in to tip' }

  const admin = createServiceClient()
  let destinationAccountId: string | null = null

  if (event.dj_id) {
    const { data: dj } = await admin
      .from('users')
      .select('stripe_connect_account_id, stripe_connect_onboarded')
      .eq('id', event.dj_id)
      .single()
    if (dj?.stripe_connect_onboarded && dj.stripe_connect_account_id) {
      destinationAccountId = dj.stripe_connect_account_id
    }
  }

  if (!destinationAccountId) {
    const { data: organizer } = await admin
      .from('users')
      .select('stripe_connect_account_id')
      .eq('id', event.organizer_id)
      .single()
    destinationAccountId = organizer?.stripe_connect_account_id ?? null
  }

  if (!destinationAccountId) return { error: 'Organizer Stripe not connected' }

  const applicationFee = Math.floor(amountCents * 0.03) + 99

  let paymentIntent: { client_secret: string | null }
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: applicationFee,
      transfer_data: { destination: destinationAccountId },
      metadata: {
        type: 'tip',
        request_id: requestId,
        amount_cents: String(amountCents),
        note: note ?? '',
        user_id: user.id,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Payment setup failed'
    return { error: msg }
  }

  return { clientSecret: paymentIntent.client_secret ?? undefined }
}
