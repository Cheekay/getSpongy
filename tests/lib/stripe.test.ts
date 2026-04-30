import { describe, it, expect, vi } from 'vitest'

vi.mock('stripe', () => {
  class MockStripe {
    accounts = {}
    accountLinks = {}
    paymentIntents = {}
    webhooks = {}

    constructor(public key: string, public options: any) {}
  }
  return { default: MockStripe }
})

import Stripe from 'stripe'

describe('stripe singleton', () => {
  it('exports a Stripe instance configured with the correct key and API version', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    const { stripe } = await import('@/lib/stripe')
    expect(stripe).toBeDefined()
    // stripe is a Proxy — verify it forwards to the underlying Stripe instance
    expect((stripe as any).key).toBe('sk_test_dummy')
    expect((stripe as any).options).toEqual(expect.objectContaining({
      apiVersion: '2026-03-25.dahlia',
    }))
  })
})
