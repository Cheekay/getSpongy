'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'
import { notifyWaitlist } from '@/lib/actions/waitlist'

const POLICY_WINDOW_MS = 24 * 60 * 60 * 1000

export async function requestRefund(params: {
  rsvpId: string
  reason: string
  note?: string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: rsvp, error: rsvpErr } = await supabase
    .from('rsvps')
    .select('id, status, event_id')
    .eq('id', params.rsvpId)
    .eq('user_id', user.id)
    .single()

  if (rsvpErr || !rsvp) return { error: rsvpErr?.message ?? 'Ticket not found' }
  if (!['paid', 'checked_in'].includes(rsvp.status)) {
    return { error: 'Only paid tickets can be refunded' }
  }

  const { data: event } = await supabase
    .from('events')
    .select('start_at')
    .eq('id', rsvp.event_id)
    .single()

  if (!event) return { error: 'Event not found' }

  const msUntilEvent = new Date(event.start_at).getTime() - Date.now()
  if (msUntilEvent < POLICY_WINDOW_MS) {
    return { error: 'Refunds are not available within 24 hours of the event' }
  }

  const admin = createServiceClient()
  const { error: insertErr } = await admin.from('refund_requests').insert({
    rsvp_id: params.rsvpId,
    user_id: user.id,
    reason: params.reason,
    note: params.note ?? null,
  })

  if (insertErr) return { error: insertErr.message }
  return {}
}

export async function approveRefund(requestId: string): Promise<{ error?: string }> {
  const admin = createServiceClient()

  const { data: req, error: reqErr } = await admin
    .from('refund_requests')
    .select('id, rsvp_id, status, rsvp:rsvps(id, stripe_payment_intent_id, event_id, tier_id)')
    .eq('id', requestId)
    .single()

  if (reqErr || !req) return { error: reqErr?.message ?? 'Request not found' }

  const rsvp = Array.isArray(req.rsvp) ? req.rsvp[0] : req.rsvp
  if (!rsvp?.stripe_payment_intent_id) return { error: 'No payment intent to refund' }

  let refundId: string
  try {
    const refund = await stripe.refunds.create({ payment_intent: rsvp.stripe_payment_intent_id })
    refundId = refund.id
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Stripe refund failed' }
  }

  await admin.from('rsvps').update({ status: 'refunded' }).eq('id', req.rsvp_id)
  await admin.from('refund_requests').update({
    status: 'approved',
    stripe_refund_id: refundId,
    resolved_at: new Date().toISOString(),
  }).eq('id', requestId)

  await notifyWaitlist(rsvp.event_id, rsvp.tier_id ?? undefined)

  return {}
}

export async function denyRefund(requestId: string): Promise<{ error?: string }> {
  const admin = createServiceClient()
  const { error } = await admin.from('refund_requests').update({
    status: 'denied',
    resolved_at: new Date().toISOString(),
  }).eq('id', requestId)

  if (error) return { error: error.message }
  return {}
}
