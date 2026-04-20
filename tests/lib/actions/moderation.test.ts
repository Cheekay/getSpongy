import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'dj-user' }
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { moderateRequest, revertRequest, pauseRequests, assignDj } from '@/lib/actions/moderation'

describe('moderateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when caller is not DJ or organizer', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'pending' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'other-user', organizer_id: 'other-org' } }))
    const result = await moderateRequest('req-1', 'accepted')
    expect(result.error).toBe('Not authorized')
  })

  it('returns error when accepting a non-pending request', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'accepted' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    const result = await moderateRequest('req-1', 'accepted')
    expect(result.error).toBe('Can only accept pending requests')
  })

  it('returns error when marking played a non-accepted request', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'pending' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    const result = await moderateRequest('req-1', 'played')
    expect(result.error).toBe('Can only mark accepted requests as played')
  })

  it('succeeds when DJ accepts a pending request', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'pending' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await moderateRequest('req-1', 'accepted')
    expect(result.error).toBeUndefined()
  })

  it('succeeds when organizer rejects a pending request', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'pending' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: null, organizer_id: 'dj-user' } }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await moderateRequest('req-1', 'rejected')
    expect(result.error).toBeUndefined()
  })
})

describe('revertRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when caller is not authorized', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'accepted' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'other', organizer_id: 'other' } }))
    const result = await revertRequest('req-1')
    expect(result.error).toBe('Not authorized')
  })

  it('reverts accepted request back to pending', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'req-1', event_id: 'ev-1', state: 'accepted' } }))
      .mockReturnValueOnce(makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } }))
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await revertRequest('req-1')
    expect(result.error).toBeUndefined()
  })
})

describe('pauseRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when caller is not authorized', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { dj_id: 'other', organizer_id: 'other' } })
    )
    const result = await pauseRequests('ev-1', true)
    expect(result.error).toBe('Not authorized')
  })

  it('sets requests_paused to true for authorized user', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { dj_id: 'dj-user', organizer_id: 'org-1' } })
    )
    mockServiceClient.from.mockReturnValue(makeQuery({ error: null }))
    const result = await pauseRequests('ev-1', true)
    expect(result.error).toBeUndefined()
  })
})

describe('assignDj', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when caller is not the organizer', async () => {
    // Event has a different organizer_id
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { organizer_id: 'other-org' } })
    )
    const result = await assignDj('ev-1', '+14155550000')
    expect(result.error).toBe('Not authorized')
  })

  it('returns error when no user found with that phone', async () => {
    // Event: caller is organizer
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { organizer_id: 'dj-user' } })
    )
    // Service client: user lookup returns null
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: null }))          // users select
    const result = await assignDj('ev-1', '+14155559999')
    expect(result.error).toBe('No account found with that phone number')
  })

  it('assigns DJ and returns djName on success', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { organizer_id: 'dj-user' } })
    )
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'dj-id-123', name: 'DJ Kalani' } })) // users select
      .mockReturnValueOnce(makeQuery({ error: null }))                                    // events update
    const result = await assignDj('ev-1', '+14155550001')
    expect(result.error).toBeUndefined()
    expect(result.djName).toBe('DJ Kalani')
  })
})
