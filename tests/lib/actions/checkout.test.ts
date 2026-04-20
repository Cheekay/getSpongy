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
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
  },
}))

vi.mock('@/lib/jwt', () => ({
  signQrJwt: vi.fn(async () => 'jwt-token-123'),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { createPaymentIntent, markRsvpPaid } from '@/lib/actions/checkout'
import { stripe } from '@/lib/stripe'

describe('createPaymentIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await createPaymentIntent({ eventId: 'e-1', tierId: 't-1' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when tier is sold out', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'published', rsvp_type: 'paid', organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: 't-1', price_cents: 2000, inventory: 10, sold_count: 10, active: true }, error: null }))
    const result = await createPaymentIntent({ eventId: 'e-1', tierId: 't-1' })
    expect(result.error).toBe('This tier is sold out')
  })

  it('returns error when already purchased', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'published', rsvp_type: 'paid', organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: 't-1', price_cents: 2000, inventory: 100, sold_count: 5, active: true }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-1', status: 'paid' }, error: null }))
    const result = await createPaymentIntent({ eventId: 'e-1', tierId: 't-1' })
    expect(result.error).toBe('Already purchased')
  })

  it('returns clientSecret on success', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'published', rsvp_type: 'paid', organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: 't-1', price_cents: 2000, inventory: 100, sold_count: 5, active: true }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null })) // no existing RSVP
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { stripe_connect_account_id: 'acct_org' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-new' }, error: null })) // upsert rsvp
      .mockReturnValueOnce(makeQuery({ error: null })) // update rsvp with pi_id
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({ id: 'pi_123', client_secret: 'pi_123_secret' } as never)

    const result = await createPaymentIntent({ eventId: 'e-1', tierId: 't-1' })
    expect(result.clientSecret).toBe('pi_123_secret')
    expect(vi.mocked(stripe.paymentIntents.create)).toHaveBeenCalledWith(
      expect.objectContaining({ application_fee_amount: 159 })
    )
  })
})

describe('markRsvpPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when PaymentIntent not succeeded', async () => {
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({ id: 'pi_123', status: 'processing', metadata: {} } as never)
    const result = await markRsvpPaid({ rsvpId: 'rsvp-1', paymentIntentId: 'pi_123' })
    expect(result.error).toBe('Payment not yet completed')
  })

  it('returns qrJwt on success', async () => {
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
      id: 'pi_123', status: 'succeeded',
      metadata: { rsvp_id: 'rsvp-1', tier_id: 't-1', event_id: 'e-1', user_id: 'attendee-1', amount: '2000' },
      amount: 2000,
    } as never)
    mockSupabaseClient.from.mockReturnValue(makeQuery({ data: { id: 'rsvp-1', status: 'rsvpd', event_id: 'e-1', user_id: 'attendee-1' }, error: null }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))

    const result = await markRsvpPaid({ rsvpId: 'rsvp-1', paymentIntentId: 'pi_123' })
    expect(result.qrJwt).toBe('jwt-token-123')
  })
})
