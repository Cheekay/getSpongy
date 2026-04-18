'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'

export async function sendOtp(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const phone = (formData.get('phone') as string)?.trim()
  if (!phone) return { error: 'Phone number is required' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) return { error: error.message }
  return {}
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
    .select('name')
    .eq('id', user.id)
    .single()

  if (!profile?.name) {
    redirect(`/setup?redirect=${encodeURIComponent(redirectTo)}`)
  }
  redirect(redirectTo)
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
  const { error } = await admin.from('users').insert({
    id: user.id,
    phone: user.phone!,
    name,
    role_flags: { attendee: true, dj: false, organizer: false },
  })
  if (error) return { error: error.message }

  redirect(redirectTo)
}
