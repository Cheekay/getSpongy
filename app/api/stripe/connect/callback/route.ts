import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id')
  if (!accountId) return redirect('/events?stripe=error')

  // Verify the authenticated user owns this account
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('stripe_connect_account_id')
    .eq('id', user.id)
    .single()

  if (userData?.stripe_connect_account_id !== accountId) {
    return redirect('/events?stripe=error')
  }

  // Now safe to proceed
  try {
    const account = await stripe.accounts.retrieve(accountId)
    const onboarded = account.details_submitted === true

    const admin = createServiceClient()
    const { error: updateError } = await admin
      .from('users')
      .update({ stripe_connect_onboarded: onboarded })
      .eq('stripe_connect_account_id', accountId)

    if (updateError) return redirect('/events?stripe=error')
  } catch {
    return redirect('/events?stripe=error')
  }

  revalidatePath('/events')
  return redirect('/events?stripe=connected')
}
