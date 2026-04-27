import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────────
const mockUser = { id: 'user-123' }
let mockAuthUser: { id: string } | null = mockUser

const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: mockAuthUser } })),
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/profanity', () => ({
  containsProfanity: vi.fn((text: string) => text.includes('BAD')),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// ─── Helper: build a chainable Supabase query mock ─────────────────────────
function makeQuery(result: unknown) {
  const q = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  // Allow the builder itself to be awaited for count queries
  Object.assign(q, { then: (r: (v: unknown) => void) => Promise.resolve(result).then(r) })
  return q
}

import { submitRequest, withdrawRequest } from '@/lib/actions/requests'

const validParams = {
  eventId: 'event-abc',
  spotifyTrackId: 'spotify-1',
  trackTitle: 'Levitating',
  trackArtist: 'Dua Lipa',
  albumArtUrl: 'https://img.example.com/art.jpg',
}

describe('submitRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockImplementation(async () => ({ data: { user: mockAuthUser } }))
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockImplementation(async () => ({ data: { user: null } }))
    const result = await submitRequest(validParams)
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when shoutout contains profanity', async () => {
    // profanity check runs before any DB calls
    const result = await submitRequest({ ...validParams, shoutoutText: 'play some BAD music' })
    expect(result.error).toBe('Shoutout contains inappropriate language')
  })

  it('returns error when event is not live', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { state: 'published', requests_paused: false, requests_paused_until: null } })
    )
    const result = await submitRequest(validParams)
    expect(result.error).toBe('Event is not live')
  })

  it('returns error when requests are paused', async () => {
    const pausedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { state: 'live', requests_paused: true, requests_paused_until: pausedUntil } })
    )
    const result = await submitRequest(validParams)
    expect(result.error).toMatch(/DJ is focused/)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('returns error when duplicate track is already in queue', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 1 }))   // RSVP check → has RSVP
      .mockReturnValueOnce(makeQuery({ count: 0 }))   // rate limit → not limited
      .mockReturnValueOnce(makeQuery({ count: 1 }))   // duplicate → found
    const result = await submitRequest(validParams)
    expect(result.error).toBe('This song is already in the queue')
  })

  it('returns requestId on successful submission', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 1 }))   // RSVP exists
      .mockReturnValueOnce(makeQuery({ count: 0 }))   // no rate limit
      .mockReturnValueOnce(makeQuery({ count: 0 }))   // no duplicate
    mockServiceClient.from.mockReturnValue(makeQuery({ data: { id: 'req-999' }, error: null }))

    const result = await submitRequest(validParams)
    expect(result.requestId).toBe('req-999')
    expect(result.error).toBeUndefined()
  })

  it('returns error when user has no RSVP', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 0 })) // RSVP check → none
    const result = await submitRequest(validParams)
    expect(result.error).toBe('You must RSVP before submitting requests')
  })

  it('returns retryAfterSeconds when rate-limited', async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 1000).toISOString() // submitted 2 min ago
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 1 })) // RSVP exists
      .mockReturnValueOnce(makeQuery({ count: 1 })) // recent requests → rate limited
      .mockReturnValueOnce(makeQuery({ data: { created_at: createdAt } })) // latest request
    const result = await submitRequest(validParams)
    expect(result.error).toMatch(/Please wait/)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThan(600) // less than 10 min
  })

  it('returns error when the DB insert fails', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', requests_paused: false, requests_paused_until: null } }))
      .mockReturnValueOnce(makeQuery({ count: 1 })) // RSVP exists
      .mockReturnValueOnce(makeQuery({ count: 0 })) // no rate limit
      .mockReturnValueOnce(makeQuery({ count: 0 })) // no duplicate
    mockServiceClient.from.mockReturnValue(makeQuery({ data: null, error: { message: 'insert failed' } }))
    const result = await submitRequest(validParams)
    expect(result.error).toBe('insert failed')
  })
})

describe('withdrawRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockImplementation(async () => ({ data: { user: mockAuthUser } }))
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockImplementation(async () => ({ data: { user: null } }))
    const result = await withdrawRequest('req-123')
    expect(result.error).toBe('Not authenticated')
  })

  it('calls update with withdrawn state for own pending request', async () => {
    const mockIn = vi.fn(async () => ({ error: null }))
    mockSupabaseClient.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: mockIn,
          }),
        }),
      }),
    })
    const result = await withdrawRequest('req-123')
    expect(mockIn).toHaveBeenCalledWith('state', ['pending'])
    expect(result.error).toBeUndefined()
  })
})
