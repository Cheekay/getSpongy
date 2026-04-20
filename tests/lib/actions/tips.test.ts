import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'attendee-1' }
let mockAuthUser: { id: string } | null = mockUser

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
    paymentIntents: { create: vi.fn() },
  },
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { submitTip } from '@/lib/actions/tips'
import { stripe } from '@/lib/stripe'

describe('submitTip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await submitTip({ requestId: 'req-1', amountCents: 200 })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when tips are disabled', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { tips_enabled: false, min_tip_cents: 100, organizer_id: 'org-1' }, error: null }))
    const result = await submitTip({ requestId: 'req-1', amountCents: 200 })
    expect(result.error).toBe('Tips are not enabled for this event')
  })

  it('returns error when amount is below minimum', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { tips_enabled: true, min_tip_cents: 200, organizer_id: 'org-1' }, error: null }))
    const result = await submitTip({ requestId: 'req-1', amountCents: 100 })
    expect(result.error).toMatch(/minimum/)
  })

  it('returns error when user is not checked in', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { tips_enabled: true, min_tip_cents: 100, organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'rsvpd' }, error: null }))
    const result = await submitTip({ requestId: 'req-1', amountCents: 200 })
    expect(result.error).toBe('Must be checked in to tip')
  })

  it('returns clientSecret on success', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { tips_enabled: true, min_tip_cents: 100, organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'checked_in' }, error: null }))
    mockServiceClient.from.mockReturnValue(makeQuery({ data: { stripe_connect_account_id: 'acct_org' }, error: null }))
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ client_secret: 'pi_tip_secret' } as any)

    const result = await submitTip({ requestId: 'req-1', amountCents: 200 })
    expect(result.clientSecret).toBe('pi_tip_secret')
  })
})
