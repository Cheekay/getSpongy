'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { signQrJwt } from '@/lib/jwt'

export async function createPaymentIntent(params: {
  eventId: string
  tierId: string
}): Promise<{ clientSecret?: string; rsvpId?: string; error?: string }> {
  const { eventId, tierId } = params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: event } = await supabase
    .from('events')
    .select('state, rsvp_type, organizer_id')
    .eq('id', eventId)
    .single()

  if (!event || !['published', 'live'].includes(event.state)) return { error: 'Event not available' }
  if (event.rsvp_type !== 'paid') return { error: 'This event does not require payment' }

  const { data: tier } = await supabase
    .from('ticket_tiers')
    .select('id, price_cents, inventory, sold_count, active')
    .eq('id', tierId)
    .eq('event_id', eventId)
    .single()

  if (!tier || !tier.active) return { error: 'Tier not available' }
  if (tier.inventory !== null && tier.sold_count >= tier.inventory) return { error: 'This tier is sold out' }

  const { data: existingRsvp } = await supabase
    .from('rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingRsvp && ['paid', 'checked_in'].includes(existingRsvp.status)) {
    return { error: 'Already purchased' }
  }

  const admin = createServiceClient()

  const { data: organizerData } = await admin
    .from('users')
    .select('stripe_connect_account_id')
    .eq('id', event.organizer_id)
    .single()

  if (!organizerData?.stripe_connect_account_id) return { error: 'Organizer Stripe account not connected' }

  const { data: rsvp } = await admin
    .from('rsvps')
    .upsert({ event_id: eventId, user_id: user.id, tier_id: tierId, status: 'rsvpd' }, { onConflict: 'event_id,user_id' })
    .select('id')
    .single()

  if (!rsvp) return { error: 'Failed to create RSVP' }

  const applicationFee = Math.floor(tier.price_cents * 0.03) + 99

  let paymentIntent: { id: string; client_secret: string | null }
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: tier.price_cents,
      currency: 'usd',
      application_fee_amount: applicationFee,
      transfer_data: { destination: organizerData.stripe_connect_account_id },
      metadata: {
        rsvp_id: rsvp.id,
        tier_id: tierId,
        event_id: eventId,
        user_id: user.id,
        amount: String(tier.price_cents),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Payment setup failed'
    return { error: msg }
  }

  await admin
    .from('rsvps')
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq('id', rsvp.id)

  return { clientSecret: paymentIntent.client_secret!, rsvpId: rsvp.id }
}

export async function markRsvpPaid(params: {
  rsvpId: string
  paymentIntentId: string
}): Promise<{ qrJwt?: string; error?: string }> {
  const { rsvpId, paymentIntentId } = params

  let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to verify payment'
    return { error: msg }
  }
  if (paymentIntent.status !== 'succeeded') return { error: 'Payment not yet completed' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: rsvp } = await supabase
    .from('rsvps')
    .select('id, status, event_id, user_id')
    .eq('id', rsvpId)
    .eq('user_id', user.id)
    .single()

  if (!rsvp) return { error: 'RSVP not found' }
  if (['paid', 'checked_in'].includes(rsvp.status)) {
    const { data: existing } = await supabase
      .from('rsvps')
      .select('qr_jwt')
      .eq('id', rsvpId)
      .single()
    return { qrJwt: existing?.qr_jwt ?? undefined }
  }

  const qrJwt = await signQrJwt({ rsvpId, eventId: rsvp.event_id, userId: rsvp.user_id })
  const priceCents = paymentIntent.amount

  const admin = createServiceClient()
  await admin
    .from('rsvps')
    .update({ status: 'paid', qr_jwt: qrJwt, price_paid_cents: priceCents })
    .eq('id', rsvpId)

  return { qrJwt }
}
