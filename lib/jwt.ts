import { SignJWT, jwtVerify, type KeyLike } from 'jose'

const TOKEN_EXPIRY = '24h'
const NEAR_EXPIRY_THRESHOLD_SECONDS = 3600

export interface QrPayload {
  rsvpId: string
  eventId: string
  userId: string
}

function getSecret(): KeyLike {
  return new TextEncoder().encode(process.env.QR_JWT_SECRET!) as unknown as KeyLike
}

export async function signQrJwt(payload: QrPayload): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(getSecret())
}

export async function verifyQrJwt(token: string): Promise<QrPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as QrPayload
}

export function isQrJwtNearExpiry(token: string): boolean {
  const parts = token.split('.')
  if (parts.length < 2) return true
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8')
    const { exp } = JSON.parse(payloadJson) as { exp?: number }
    if (!exp) return true
    const oneHourFromNow = Math.floor(Date.now() / 1000) + NEAR_EXPIRY_THRESHOLD_SECONDS
    return exp < oneHourFromNow
  } catch {
    return true
  }
}
