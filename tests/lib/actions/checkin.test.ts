// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isDuplicateCheckIn, formatCheckinTime } from '@/lib/actions/checkin'

describe('isDuplicateCheckIn', () => {
  it('returns true for checked_in status', () => {
    expect(isDuplicateCheckIn('checked_in')).toBe(true)
  })

  it('returns false for rsvpd status', () => {
    expect(isDuplicateCheckIn('rsvpd')).toBe(false)
  })

  it('returns false for paid status', () => {
    expect(isDuplicateCheckIn('paid')).toBe(false)
  })
})

describe('formatCheckinTime', () => {
  it('formats an ISO timestamp to time only', () => {
    const ts = '2026-05-03T21:43:00.000Z'
    const result = formatCheckinTime(ts)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns empty string for null', () => {
    expect(formatCheckinTime(null)).toBe('')
  })
})

import { signQrJwt } from '@/lib/jwt'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'org-user' } } })) },
    from: mockFrom,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function makeCheckinChain(returnVal: object) {
  const b: Record<string, unknown> = {}
  const self = () => b
  b.select = vi.fn(self)
  b.update = vi.fn(self)
  b.eq    = vi.fn(self)
  b.single = vi.fn(async () => returnVal)
  b.then = (resolve: (v: object) => void) => Promise.resolve(returnVal).then(resolve)
  return b
}

describe('verifyAndCheckIn', () => {
  beforeEach(() => {
    process.env.QR_JWT_SECRET = 'a-test-secret-that-is-at-least-32-chars!!'
    vi.clearAllMocks()
  })

  it('returns error for invalid JWT format', async () => {
    const { verifyAndCheckIn } = await import('@/lib/actions/checkin')
    const result = await verifyAndCheckIn('not-a-jwt')
    expect(result.error).toMatch(/Invalid/)
  })

  it('returns error for tampered JWT', async () => {
    const { verifyAndCheckIn } = await import('@/lib/actions/checkin')
    const forgery = 'eyJhbGciOiJIUzI1NiJ9.eyJyc3ZwSWQiOiJmYWtlIn0.INVALIDSIG'
    const result = await verifyAndCheckIn(forgery)
    expect(result.error).toMatch(/Invalid/)
  })

  it('returns error if RSVP not found in DB', async () => {
    process.env.QR_JWT_SECRET = 'a-test-secret-that-is-at-least-32-chars!!'
    const jwt = await signQrJwt({ rsvpId: 'rsvp-abc', eventId: 'ev-1', userId: 'u-1' })
    mockFrom.mockReturnValue(makeCheckinChain({ data: null, error: { message: 'not found' } }))
    const { verifyAndCheckIn } = await import('@/lib/actions/checkin')
    const result = await verifyAndCheckIn(jwt)
    expect(result.error).toBeDefined()
  })

  it('returns duplicate:true for already checked-in RSVP', async () => {
    process.env.QR_JWT_SECRET = 'a-test-secret-that-is-at-least-32-chars!!'
    const jwt = await signQrJwt({ rsvpId: 'rsvp-abc', eventId: 'ev-1', userId: 'u-1' })
    mockFrom.mockReturnValue(makeCheckinChain({ data: { id: 'rsvp-abc', status: 'checked_in', event_id: 'ev-1' } }))
    const { verifyAndCheckIn } = await import('@/lib/actions/checkin')
    const result = await verifyAndCheckIn(jwt)
    expect(result.duplicate).toBe(true)
  })

  it('checks in a valid RSVP and returns checkedInAt', async () => {
    process.env.QR_JWT_SECRET = 'a-test-secret-that-is-at-least-32-chars!!'
    const jwt = await signQrJwt({ rsvpId: 'rsvp-abc', eventId: 'ev-1', userId: 'u-1' })
    mockFrom
      .mockReturnValueOnce(makeCheckinChain({ data: { id: 'rsvp-abc', status: 'rsvpd', event_id: 'ev-1' } }))
      .mockReturnValue(makeCheckinChain({ error: null }))
    const { verifyAndCheckIn } = await import('@/lib/actions/checkin')
    const result = await verifyAndCheckIn(jwt)
    expect(result.checkedInAt).toBeDefined()
    expect(result.error).toBeUndefined()
  })
})
