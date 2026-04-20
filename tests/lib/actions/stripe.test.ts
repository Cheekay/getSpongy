import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-123' }
let mockAuthUser: { id: string } | null = mockUser

const mockSupabaseClient = {
  auth: { getUser: vi.fn(async () => ({ data: { user: mockAuthUser } })) },
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
    accounts: { create: vi.fn(), retrieve: vi.fn() },
    accountLinks: { create: vi.fn() },
  },
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { initiateStripeConnect } from '@/lib/actions/stripe'
import { stripe } from '@/lib/stripe'

describe('initiateStripeConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await initiateStripeConnect()
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when already onboarded', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_onboarded: true, stripe_connect_account_id: 'acct_123' } })
    )
    const result = await initiateStripeConnect()
    expect(result.error).toBe('Already connected')
  })

  it('creates account, stores account_id, returns accountLink url', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_connect_onboarded: false, stripe_connect_account_id: null } })
    )
    vi.mocked(stripe.accounts.create).mockResolvedValue({ id: 'acct_new' } as never)
    vi.mocked(stripe.accountLinks.create).mockResolvedValue({ url: 'https://connect.stripe.com/setup/...' } as never)
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))

    const result = await initiateStripeConnect()
    expect(result.url).toBe('https://connect.stripe.com/setup/...')
    expect(stripe.accounts.create).toHaveBeenCalledWith({ type: 'express' })
    expect(mockServiceClient.from).toHaveBeenCalledWith('users')
  })
})
