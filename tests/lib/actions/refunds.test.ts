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

vi.mock('@/lib/stripe', () => ({
  stripe: {
    refunds: { create: vi.fn() },
  },
}))

vi.mock('@/lib/actions/waitlist', () => ({
  notifyWaitlist: vi.fn(),
}))

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

import { requestRefund, approveRefund, denyRefund } from '@/lib/actions/refunds'
import { stripe } from '@/lib/stripe'
import { notifyWaitlist } from '@/lib/actions/waitlist'

describe('requestRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when RSVP not owned by user', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: null, error: { message: 'not found' } })
    )
    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toBeDefined()
  })

  it('returns error when event starts within 24h', async () => {
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-1', status: 'paid', event_id: 'event-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { start_at: soon }, error: null }))
    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toMatch(/24 hours/i)
  })

  it('creates refund request row when event is far enough away', async () => {
    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-1', status: 'paid', event_id: 'event-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { start_at: farFuture }, error: null }))
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r),
    }
    mockServiceClient.from.mockReturnValue(insertQuery)

    const result = await requestRefund({ rsvpId: 'rsvp-1', reason: 'cant make it' })
    expect(result.error).toBeUndefined()
    expect(insertQuery.insert).toHaveBeenCalled()
  })
})

describe('approveRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'org-1' } } })
  })

  it('issues Stripe refund and updates RSVP + request status', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({
        data: {
          id: 'req-1', rsvp_id: 'rsvp-1', status: 'pending',
          rsvp: { id: 'rsvp-1', stripe_payment_intent_id: 'pi_123', event_id: 'event-1' },
        },
        error: null,
      }))
    vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_123' } as any)
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockServiceClient.from.mockReturnValue(updateQuery)
    vi.mocked(notifyWaitlist).mockResolvedValue(undefined)

    const result = await approveRefund('req-1')
    expect(result.error).toBeUndefined()
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_123' })
    expect(notifyWaitlist).toHaveBeenCalledWith('event-1', undefined)
  })

  it('returns error when Stripe refund fails', async () => {
    mockServiceClient.from.mockReturnValueOnce(makeQuery({
      data: {
        id: 'req-1', rsvp_id: 'rsvp-1', status: 'pending',
        rsvp: { id: 'rsvp-1', stripe_payment_intent_id: 'pi_123', event_id: 'event-1' },
      },
      error: null,
    }))
    vi.mocked(stripe.refunds.create).mockRejectedValue(new Error('Card declined'))

    const result = await approveRefund('req-1')
    expect(result.error).toMatch(/Card declined/)
  })
})

describe('denyRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'org-1' } } })
  })

  it('sets request status to denied', async () => {
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await denyRefund('req-1')
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }))
  })
})
