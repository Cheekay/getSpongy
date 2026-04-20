import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) return redirect('/events?stripe=error')

  try {
    const account = await stripe.accounts.retrieve(accountId)
    const onboarded = account.details_submitted === true

    const admin = createServiceClient()
    await admin
      .from('users')
      .update({ stripe_connect_onboarded: onboarded })
      .eq('stripe_connect_account_id', accountId)
  } catch {
    return redirect('/events?stripe=error')
  }

  return redirect('/events?stripe=connected')
}
