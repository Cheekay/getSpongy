import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'attendee-1' }
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

function makeQuery(result: unknown, extra: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    ...extra,
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { joinWaitlist, leaveWaitlist } from '@/lib/actions/waitlist'

describe('joinWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await joinWaitlist({ eventId: 'event-1' })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when already on waitlist', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { position: 2 }, error: null }))
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }),
    }
    mockServiceClient.from.mockReturnValueOnce(insertQuery)

    const result = await joinWaitlist({ eventId: 'event-1' })
    expect(result.error).toMatch(/already/i)
  })

  it('returns position on success', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { position: 3 }, error: null }))
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { position: 4 }, error: null }),
    }
    mockServiceClient.from.mockReturnValueOnce(insertQuery)

    const result = await joinWaitlist({ eventId: 'event-1' })
    expect(result.error).toBeUndefined()
    expect(result.position).toBe(4)
  })
})

describe('leaveWaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await leaveWaitlist('event-1')
    expect(result.error).toBe('Not authenticated')
  })

  it('removes waitlist row', async () => {
    const deleteQuery = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r),
    }
    mockServiceClient.from.mockReturnValue(deleteQuery)

    const result = await leaveWaitlist('event-1')
    expect(result.error).toBeUndefined()
    expect(deleteQuery.delete).toHaveBeenCalled()
  })
})
