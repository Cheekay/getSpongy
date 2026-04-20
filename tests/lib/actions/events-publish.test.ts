import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'org-user' }
let mockAuthUser: { id: string } | null = mockUser

const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

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

import { publishEvent } from '@/lib/actions/events'

describe('publishEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await publishEvent('event-1')
    expect(result.error).toBe('Unauthorized')
  })

  it('blocks paid event when Stripe not onboarded', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { rsvp_type: 'paid', state: 'draft', organizer_id: 'org-user' } }))
      .mockReturnValueOnce(makeQuery({ data: { stripe_connect_onboarded: false } }))
    const result = await publishEvent('event-1')
    expect(result.error).toBe('Connect Stripe to publish paid events')
    expect(result.requiresStripe).toBe(true)
  })

  it('publishes free event without Stripe check', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { rsvp_type: 'free', state: 'draft', organizer_id: 'org-user' } }))
      .mockReturnValueOnce(makeQuery({ data: [{ id: 'event-1' }], error: null }))
    const result = await publishEvent('event-1')
    expect(result.error).toBeUndefined()
  })

  it('publishes paid event when Stripe is onboarded', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { rsvp_type: 'paid', state: 'draft', organizer_id: 'org-user' } }))
      .mockReturnValueOnce(makeQuery({ data: { stripe_connect_onboarded: true } }))
      .mockReturnValueOnce(makeQuery({ data: [{ id: 'event-1' }], error: null }))
    const result = await publishEvent('event-1')
    expect(result.error).toBeUndefined()
  })

  it('returns error when event is not in draft state', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { rsvp_type: 'free', state: 'published', organizer_id: 'org-user' } }))
      .mockReturnValueOnce(makeQuery({ data: [], error: null }))
    const result = await publishEvent('event-1')
    expect(result.error).toBe('Event is not in draft state')
  })
})
