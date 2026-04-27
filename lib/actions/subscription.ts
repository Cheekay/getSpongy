'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe } from '@/lib/stripe'

export async function createCheckoutSession(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const priceId = process.env.STRIPE_PRO_PRICE_ID
  if (!appUrl || !priceId) return { error: 'Billing not configured' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id, name')
    .eq('id', user.id)
    .single()

  let customerId = userData?.stripe_customer_id ?? null

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { spongy_user_id: user.id },
      name: userData?.name ?? undefined,
    })
    customerId = customer.id
    const admin = createServiceClient()
    await admin.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  let session: { url: string | null }
  try {
    session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${appUrl}/manage/subscription?success=1`,
      cancel_url: `${appUrl}/upgrade`,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Checkout setup failed' }
  }

  return { url: session.url ?? undefined }
}

export async function createBillingPortalSession(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return { error: 'App URL not configured' }

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!userData?.stripe_customer_id) return { error: 'no billing account found — subscribe first' }

  let portalSession: { url: string }
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: userData.stripe_customer_id,
      return_url: `${appUrl}/manage/subscription`,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Portal setup failed' }
  }

  return { url: portalSession.url }
}
