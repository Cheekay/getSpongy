'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getDefaultRoute } from '@/lib/auth'
import { redirect } from 'next/navigation'

function toE164US(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // strip leading 1 if 11 digits, then prepend +1
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return `+1${ten}`
}

export async function sendOtp(
  _prev: { error?: string; success?: boolean; phone?: string },
  formData: FormData
): Promise<{ error?: string; success?: boolean; phone?: string }> {
  const raw = (formData.get('phone') as string)?.trim()
  if (!raw) return { error: 'Phone number is required' }

  const phone = toE164US(raw)
  if (phone.length !== 12) return { error: 'Enter a valid 10-digit US number' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) return { error: error.message }
  return { success: true, phone }
}

export async function verifyOtp(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const phone = (formData.get('phone') as string)?.trim()
  const token = (formData.get('token') as string)?.trim()
  const redirectTo = (formData.get('redirectTo') as string) || '/explore'

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
  if (error) return { error: error.message }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session not established' }

  const { data: profile } = await supabase
    .from('users')
    .select('name, role_flags')
    .eq('id', user.id)
    .single()

  if (!profile?.name) {
    redirect(`/setup?redirect=${encodeURIComponent(redirectTo)}`)
  }

  // Use role-based default when no explicit deep-link redirect was requested
  const destination = redirectTo === '/explore'
    ? getDefaultRoute(profile.role_flags ?? {})
    : redirectTo
  redirect(destination)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function saveName(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const name = (formData.get('name') as string)?.trim()
  const redirectTo = (formData.get('redirectTo') as string) || '/explore'

  if (!name || name.length < 2) return { error: 'Please enter your name (at least 2 characters)' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const roleFlags = { attendee: true, dj: false, organizer: false }
  const { error } = await admin.from('users').insert({
    id: user.id,
    phone: user.phone!,
    name,
    role_flags: roleFlags,
  })
  if (error) return { error: error.message }

  const destination = redirectTo === '/explore' ? getDefaultRoute(roleFlags) : redirectTo
  redirect(destination)
}
