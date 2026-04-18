/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { signQrJwt, verifyQrJwt, isQrJwtNearExpiry } from '@/lib/jwt'

beforeAll(() => {
  process.env.QR_JWT_SECRET = 'test-secret-that-is-at-least-32-chars!!'
})

describe('signQrJwt', () => {
  it('returns a three-part JWT string', async () => {
    const token = await signQrJwt({ rsvpId: 'r1', eventId: 'e1', userId: 'u1' })
    expect(token.split('.')).toHaveLength(3)
  })
})

describe('verifyQrJwt', () => {
  it('round-trips the payload correctly', async () => {
    const payload = { rsvpId: 'r1', eventId: 'e1', userId: 'u1' }
    const token = await signQrJwt(payload)
    const result = await verifyQrJwt(token)
    expect(result.rsvpId).toBe('r1')
    expect(result.eventId).toBe('e1')
    expect(result.userId).toBe('u1')
  })

  it('throws on a tampered token', async () => {
    const token = await signQrJwt({ rsvpId: 'r1', eventId: 'e1', userId: 'u1' })
    const tampered = token.slice(0, -4) + 'xxxx'
    await expect(verifyQrJwt(tampered)).rejects.toThrow()
  })
})

describe('isQrJwtNearExpiry', () => {
  it('returns false for a freshly issued 24h token', async () => {
    const token = await signQrJwt({ rsvpId: 'r1', eventId: 'e1', userId: 'u1' })
    expect(isQrJwtNearExpiry(token)).toBe(false)
  })

  it('returns true for a token expiring in less than 1 hour', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const expIn30Min = Math.floor(Date.now() / 1000) + 1800
    const payloadB64 = Buffer.from(JSON.stringify({ rsvpId: 'r', eventId: 'e', userId: 'u', exp: expIn30Min })).toString('base64url')
    const fakeToken = `${header}.${payloadB64}.fakesig`
    expect(isQrJwtNearExpiry(fakeToken)).toBe(true)
  })
})
