import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
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
    customers: { create: vi.fn(), list: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

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

import { createCheckoutSession, createBillingPortalSession } from '@/lib/actions/subscription'
import { stripe } from '@/lib/stripe'

describe('createCheckoutSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro_monthly'
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await createCheckoutSession()
    expect(result.error).toBe('Not authenticated')
  })

  it('creates a new Stripe customer when none exists and returns checkout URL', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: null }, error: null })
    )
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    vi.mocked(stripe.customers.create).mockResolvedValue({ id: 'cus_new' } as any)
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/session' } as any)

    const result = await createCheckoutSession()
    expect(result.url).toBe('https://checkout.stripe.com/session')
    expect(stripe.customers.create).toHaveBeenCalled()
  })

  it('reuses existing Stripe customer ID', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    )
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({ url: 'https://checkout.stripe.com/session2' } as any)

    const result = await createCheckoutSession()
    expect(result.url).toBe('https://checkout.stripe.com/session2')
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })
})

describe('createBillingPortalSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  it('returns error when no stripe_customer_id', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: null }, error: null })
    )
    const result = await createBillingPortalSession()
    expect(result.error).toMatch(/no billing account/)
  })

  it('returns portal URL for existing customer', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    )
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({ url: 'https://billing.stripe.com/portal' } as any)

    const result = await createBillingPortalSession()
    expect(result.url).toBe('https://billing.stripe.com/portal')
  })
})
