'use server'

import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const TRANSFER_EXPIRY = '24h'

function getTransferSecret() {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!)
}

async function signTransferToken(payload: { transferId: string; rsvpId: string }): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TRANSFER_EXPIRY)
    .setIssuedAt()
    .sign(getTransferSecret())
}

export async function initiateTransfer(params: {
  rsvpId: string
  recipientPhone: string
}): Promise<{ token?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: rsvp, error: rsvpError } = await supabase
    .from('rsvps')
    .select('id, status, event_id')
    .eq('id', params.rsvpId)
    .eq('user_id', user.id)
    .single()

  if (rsvpError || !rsvp) return { error: rsvpError?.message ?? 'RSVP not found' }
  if (!['paid', 'checked_in'].includes(rsvp.status)) {
    return { error: 'Can only transfer a paid ticket' }
  }

  const token = await signTransferToken({ transferId: 'pending', rsvpId: params.rsvpId })
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const admin = createServiceClient()
  const { data: transfer, error: insertError } = await admin
    .from('ticket_transfers')
    .insert({
      rsvp_id: params.rsvpId,
      from_user_id: user.id,
      recipient_phone: params.recipientPhone,
      token,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (insertError || !transfer) return { error: insertError?.message ?? 'Transfer creation failed' }

  return { token }
}

export async function cancelTransfer(transferId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin
    .from('ticket_transfers')
    .update({ status: 'cancelled' })
    .eq('id', transferId)
    .eq('from_user_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function claimTransfer(token: string): Promise<{ qrJwt?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  let payload: { transferId: string; rsvpId: string }
  try {
    const result = await jwtVerify(token, getTransferSecret())
    payload = result.payload as { transferId: string; rsvpId: string }
  } catch {
    return { error: 'Invalid or expired transfer link' }
  }

  const admin = createServiceClient()

  const { data: transfer, error: transferErr } = await admin
    .from('ticket_transfers')
    .select('id, status, rsvp_id')
    .eq('token', token)
    .single()

  if (transferErr || !transfer) return { error: 'Transfer not found' }
  if (transfer.status !== 'pending') return { error: 'Transfer already claimed or cancelled' }

  const { data: originalRsvp, error: rsvpErr } = await admin
    .from('rsvps')
    .select('id, event_id, tier_id, status')
    .eq('id', payload.rsvpId)
    .single()

  if (rsvpErr || !originalRsvp) return { error: 'Original ticket not found' }

  const { data: newRsvp, error: newRsvpErr } = await admin
    .from('rsvps')
    .insert({
      event_id: originalRsvp.event_id,
      user_id: user.id,
      tier_id: originalRsvp.tier_id,
      status: 'paid',
      qr_jwt: crypto.randomUUID(),
    })
    .select('id, qr_jwt')
    .single()

  if (newRsvpErr || !newRsvp) return { error: newRsvpErr?.message ?? 'Failed to create ticket' }

  await admin.from('rsvps').update({ status: 'transferred' }).eq('id', payload.rsvpId)
  await admin.from('ticket_transfers').update({ status: 'claimed', claimed_at: new Date().toISOString() }).eq('id', transfer.id)

  return { qrJwt: newRsvp.qr_jwt }
}
