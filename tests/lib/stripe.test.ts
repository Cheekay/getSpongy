import { describe, it, expect, vi } from 'vitest'

vi.mock('stripe', () => {
  class MockStripe {
    constructor() {
      this.accounts = {}
      this.accountLinks = {}
    }
  }
  return { default: MockStripe }
})

describe('stripe singleton', () => {
  it('exports a stripe instance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
    const { stripe } = await import('@/lib/stripe')
    expect(stripe).toBeDefined()
  })
})
