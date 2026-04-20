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

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { toggleUpvote } from '@/lib/actions/upvotes'

describe('toggleUpvote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await toggleUpvote('req-1')
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when request is not pending', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'accepted', event_id: 'e-1', upvote_count: 3 }, error: null }))
    const result = await toggleUpvote('req-1')
    expect(result.error).toBe('Can only upvote pending requests')
  })

  it('returns error when user is not checked in', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1', upvote_count: 0 }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'rsvpd' }, error: null }))
    const result = await toggleUpvote('req-1')
    expect(result.error).toBe('Must be checked in to upvote')
  })

  it('adds upvote when not yet voted (returns voted: true, incremented count)', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1', upvote_count: 2 }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'checked_in' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: null, error: null })) // no existing upvote
    mockServiceClient.from.mockReturnValueOnce(makeQuery({ error: null })) // insert upvote

    const result = await toggleUpvote('req-1')
    expect(result.voted).toBe(true)
    expect(result.count).toBe(3)
  })

  it('removes upvote when already voted (returns voted: false, decremented count)', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'pending', event_id: 'e-1', upvote_count: 5 }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { status: 'checked_in' }, error: null }))
      .mockReturnValueOnce(makeQuery({ data: { id: 'uv-1' }, error: null })) // existing upvote found
    mockServiceClient.from.mockReturnValueOnce(makeQuery({ error: null })) // delete upvote

    const result = await toggleUpvote('req-1')
    expect(result.voted).toBe(false)
    expect(result.count).toBe(4)
  })
})
