import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    accounts: { retrieve: vi.fn() },
  },
}))

vi.mock('@/lib/jwt', () => ({
  signQrJwt: vi.fn(async () => 'qr-jwt-result'),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { POST } from '@/app/api/stripe/webhook/route'
import { stripe } from '@/lib/stripe'

function makeRequest(body: string, sig: string) {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': sig, 'content-type': 'application/json' },
    body,
  })
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  })

  it('returns 400 when signature verification fails', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => { throw new Error('Invalid signature') })
    const req = makeRequest('{}', 'bad-sig')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 for unhandled event types', async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({ type: 'customer.created', data: { object: {} } } as any)
    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('handles payment_intent.succeeded for ticket purchase', async () => {
    const pi = {
      id: 'pi_123', status: 'succeeded', amount: 2000,
      metadata: { rsvp_id: 'rsvp-1', tier_id: 'tier-1', event_id: 'e-1', user_id: 'u-1' },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({ type: 'payment_intent.succeeded', data: { object: pi } } as any)
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'rsvp-1', status: 'rsvpd', event_id: 'e-1', user_id: 'u-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ error: null })) // update rsvp
      .mockReturnValueOnce(makeQuery({ data: { sold_count: 5 }, error: null })) // fetch sold_count
      .mockReturnValueOnce(makeQuery({ error: null })) // update sold_count

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockServiceClient.from).toHaveBeenCalledWith('rsvps')
  })

  it('handles payment_intent.succeeded for tip', async () => {
    const pi = {
      id: 'pi_456', status: 'succeeded', amount: 200,
      metadata: { type: 'tip', request_id: 'req-1', amount_cents: '200' },
    }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({ type: 'payment_intent.succeeded', data: { object: pi } } as any)
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { tip_cents: 0 }, error: null })) // fetch current tip
      .mockReturnValueOnce(makeQuery({ error: null })) // update tip

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('handles account.updated', async () => {
    const account = { id: 'acct_123', details_submitted: true, payouts_enabled: true }
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({ type: 'account.updated', data: { object: account } } as any)
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))

    const req = makeRequest('{}', 'valid-sig')
    const res = await POST(req)
    expect(res.status).toBe(200)
  })
})
