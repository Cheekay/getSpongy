import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { signQrJwt } from '@/lib/jwt'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) return new NextResponse('Missing signature', { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err) {
    return new NextResponse(`Webhook Error: ${(err as Error).message}`, { status: 400 })
  }

  const admin = createServiceClient()

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    const meta = pi.metadata as Record<string, string>

    if (meta.type === 'tip') {
      const requestId = meta.request_id
      const amountCents = parseInt(meta.amount_cents, 10)
      if (requestId && !isNaN(amountCents)) {
        const { data: reqData } = await admin
          .from('song_requests')
          .select('tip_cents')
          .eq('id', requestId)
          .single()
        if (reqData !== null && reqData !== undefined) {
          await admin
            .from('song_requests')
            .update({ tip_cents: (reqData.tip_cents ?? 0) + amountCents })
            .eq('id', requestId)
        }
      }
    } else {
      const rsvpId = meta.rsvp_id
      const tierId = meta.tier_id
      if (!rsvpId) return new NextResponse('OK', { status: 200 })

      const { data: rsvp } = await admin
        .from('rsvps')
        .select('id, status, event_id, user_id')
        .eq('id', rsvpId)
        .single()

      if (rsvp && !['paid', 'checked_in'].includes(rsvp.status)) {
        const qrJwt = await signQrJwt({ rsvpId, eventId: rsvp.event_id, userId: rsvp.user_id })
        await admin
          .from('rsvps')
          .update({ status: 'paid', qr_jwt: qrJwt, price_paid_cents: pi.amount })
          .eq('id', rsvpId)

        if (tierId) {
          const { data: tierData } = await admin
            .from('ticket_tiers')
            .select('sold_count')
            .eq('id', tierId)
            .single()
          if (tierData) {
            await admin
              .from('ticket_tiers')
              .update({ sold_count: (tierData.sold_count ?? 0) + 1 })
              .eq('id', tierId)
          }
        }
      }
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    await admin
      .from('users')
      .update({ stripe_connect_onboarded: account.details_submitted === true })
      .eq('stripe_connect_account_id', account.id)
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number }
    await admin.from('users').update({
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      subscription_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
    }).eq('stripe_customer_id', sub.customer as string)
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await admin.from('users').update({
      subscription_status: 'canceled',
      stripe_subscription_id: null,
      subscription_period_end: null,
    }).eq('stripe_customer_id', sub.customer as string)
  }

  if (event.type === 'invoice.payment_failed') {
    const inv = event.data.object as Stripe.Invoice
    await admin.from('users').update({ subscription_status: 'past_due' })
      .eq('stripe_customer_id', inv.customer as string)
  }

  if (event.type === 'invoice.payment_succeeded') {
    const inv = event.data.object as Stripe.Invoice & { subscription?: string }
    if (inv.subscription) {
      await admin.from('users').update({ subscription_status: 'active' })
        .eq('stripe_customer_id', inv.customer as string)
    }
  }

  return new NextResponse('OK', { status: 200 })
}

export const runtime = 'nodejs'
