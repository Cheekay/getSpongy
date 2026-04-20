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
  it('exports a Stripe instance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    const { stripe } = await import('@/lib/stripe')
    expect(stripe).toBeDefined()
    expect(stripe).toBeInstanceOf(Stripe)
    expect(stripe.key).toBe('sk_test_dummy')
    expect(stripe.options).toEqual(expect.objectContaining({
      apiVersion: '2025-01-27.acacia',
    }))
  })
})
