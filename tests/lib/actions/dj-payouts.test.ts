import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'dj-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    transfers: { list: vi.fn() },
    payouts: {
      list: vi.fn(),
      create: vi.fn(),
    },
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

import { getDjPayoutHistory, requestDjPayout } from '@/lib/actions/dj-payouts'
import { stripe } from '@/lib/stripe'

describe('getDjPayoutHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await getDjPayoutHistory()
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when Stripe Connect not onboarded', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: null, stripe_connect_onboarded: false }, error: null })
    )
    const result = await getDjPayoutHistory()
    expect(result.error).toMatch(/not connected/i)
  })

  it('returns combined transfers and payouts list', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: 'acct_dj1', stripe_connect_onboarded: true }, error: null })
    )
    vi.mocked(stripe.transfers.list).mockResolvedValue({
      data: [{ id: 'tr_1', amount: 5000, created: 1700000000 }],
    } as any)
    vi.mocked(stripe.payouts.list).mockResolvedValue({
      data: [{ id: 'po_1', amount: 4700, created: 1700000100, status: 'paid' }],
    } as any)

    const result = await getDjPayoutHistory()
    expect(result.error).toBeUndefined()
    expect(result.transfers).toHaveLength(1)
    expect(result.payouts).toHaveLength(1)
  })
})

describe('requestDjPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not onboarded', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: null, stripe_connect_onboarded: false }, error: null })
    )
    const result = await requestDjPayout()
    expect(result.error).toMatch(/not connected/i)
  })

  it('creates a Stripe payout on the connected account', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_account_id: 'acct_dj1', stripe_connect_onboarded: true }, error: null })
    )
    vi.mocked(stripe.payouts.create).mockResolvedValue({ id: 'po_new', status: 'pending' } as any)

    const result = await requestDjPayout()
    expect(result.error).toBeUndefined()
    expect(stripe.payouts.create).toHaveBeenCalledWith(
      { currency: 'usd', method: 'instant' },
      { stripeAccount: 'acct_dj1' }
    )
  })
})
