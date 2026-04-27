import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'attendee-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    SignJWT: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.setProtectedHeader = vi.fn().mockReturnThis()
      this.setExpirationTime = vi.fn().mockReturnThis()
      this.setIssuedAt = vi.fn().mockReturnThis()
      this.sign = vi.fn().mockResolvedValue('mock-transfer-token')
    }),
    jwtVerify: vi.fn(),
  }
})

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { initiateTransfer, cancelTransfer, claimTransfer } from '@/lib/actions/transfers'
import { jwtVerify } from 'jose'

describe('initiateTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when RSVP not owned by user', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: null, error: { message: 'not found' } })
    )
    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toBeDefined()
  })

  it('returns error when RSVP status is not paid or checked_in', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { id: 'rsvp-1', status: 'rsvpd', event_id: 'event-1' }, error: null })
    )
    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toMatch(/paid.*ticket/i)
  })

  it('returns transfer token on success', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { id: 'rsvp-1', status: 'paid', event_id: 'event-1' }, error: null })
    )
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'transfer-1' }, error: null }),
    }
    mockServiceClient.from.mockReturnValue(insertQuery)

    const result = await initiateTransfer({ rsvpId: 'rsvp-1', recipientPhone: '+15550000001' })
    expect(result.error).toBeUndefined()
    expect(result.token).toBe('mock-transfer-token')
  })
})

describe('cancelTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('sets transfer status to cancelled', async () => {
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    ;(updateQuery as any).then = (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r)
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await cancelTransfer('transfer-1')
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith({ status: 'cancelled' })
  })
})

describe('claimTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'recipient-1' } } })
  })

  it('returns error for invalid JWT', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('invalid'))
    const result = await claimTransfer('bad-token')
    expect(result.error).toMatch(/invalid/i)
  })

  it('returns error when transfer not pending', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { transferId: 'transfer-1', rsvpId: 'rsvp-1' },
    } as any)
    mockServiceClient.from.mockReturnValue(
      makeQuery({ data: { id: 'transfer-1', status: 'claimed', rsvp_id: 'rsvp-1' }, error: null })
    )
    const result = await claimTransfer('valid-token')
    expect(result.error).toMatch(/already/i)
  })

  it('creates new RSVP and marks original as transferred on success', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { transferId: 'transfer-1', rsvpId: 'rsvp-1' },
    } as any)

    const transferRow = { id: 'transfer-1', status: 'pending', rsvp_id: 'rsvp-1' }
    const rsvpRow = { id: 'rsvp-1', event_id: 'event-1', tier_id: 'tier-1', status: 'paid' }
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'rsvp-new', qr_jwt: 'qr-new' }, error: null }),
    }
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: transferRow, error: null }))
      .mockReturnValueOnce(makeQuery({ data: rsvpRow, error: null }))
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(updateQuery)

    const result = await claimTransfer('valid-token')
    expect(result.error).toBeUndefined()
    expect(result.qrJwt).toBe('qr-new')
    expect(insertQuery.insert).toHaveBeenCalled()
  })
})
