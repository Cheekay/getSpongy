'use server'

import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePro } from '@/lib/pro'

const INVITE_EXPIRY = '48h'

function getInviteSecret() {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!)
}

async function signInviteToken(payload: { teamMemberId: string; organizerId: string }): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(INVITE_EXPIRY)
    .setIssuedAt()
    .sign(getInviteSecret())
}

export async function inviteTeamMember(params: {
  phone: string
  role: 'co_organizer' | 'door_staff'
}): Promise<{ inviteToken?: string; error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { data: member, error } = await admin
    .from('team_members')
    .insert({ organizer_id: user.id, invited_phone: params.phone, role: params.role })
    .select('id')
    .single()

  if (error || !member) return { error: error?.message ?? 'Failed to create invite' }

  const inviteToken = await signInviteToken({ teamMemberId: member.id, organizerId: user.id })
  return { inviteToken }
}

export async function removeTeamMember(memberId: string): Promise<{ error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('organizer_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function resendInvite(memberId: string): Promise<{ inviteToken?: string; error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('team_members')
    .select('id, organizer_id')
    .eq('id', memberId)
    .eq('organizer_id', user.id)
    .single()

  if (!member) return { error: 'Team member not found' }

  const inviteToken = await signInviteToken({ teamMemberId: member.id, organizerId: user.id })
  return { inviteToken }
}

export async function acceptTeamInvite(token: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  let payload: { teamMemberId: string; organizerId: string }
  try {
    const result = await jwtVerify(token, getInviteSecret())
    payload = result.payload as { teamMemberId: string; organizerId: string }
  } catch {
    return { error: 'Invalid or expired invite link' }
  }

  const admin = createServiceClient()
  const { error } = await admin.from('team_members').update({
    member_user_id: user.id,
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  }).eq('id', payload.teamMemberId)

  if (error) return { error: error.message }
  return {}
}
