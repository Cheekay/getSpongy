import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const PRO_STATUSES = new Set(['trialing', 'active'])

export async function isProUser(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', userId)
    .single()
  return PRO_STATUSES.has(data?.subscription_status ?? 'free')
}

export async function requirePro(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const isPro = await isProUser(user.id)
  if (!isPro) redirect('/upgrade')
}
