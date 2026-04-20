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

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { createTier, updateTier, deleteTier } from '@/lib/actions/tiers'

describe('createTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await createTier('event-1', { name: 'GA', priceCents: 1000, inventory: 100 })
    expect(result.error).toBe('Not authenticated')
  })

  it('returns error when event not owned by user', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: null, error: { message: 'not found' } })
    )
    const result = await createTier('event-1', { name: 'GA', priceCents: 1000, inventory: 100 })
    expect(result.error).toBeTruthy()
  })

  it('inserts tier and returns tierId on success', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { organizer_id: 'org-user' }, error: null })
    )
    mockServiceClient.from.mockReturnValue(
      makeQuery({ data: { id: 'tier-abc' }, error: null })
    )
    const result = await createTier('event-1', { name: 'GA', priceCents: 1000, inventory: 100 })
    expect(result.tierId).toBe('tier-abc')
  })
})

describe('deleteTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('blocks deletion when tickets have been sold', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { sold_count: 5, event: { organizer_id: 'org-user' } }, error: null })
    )
    const result = await deleteTier('tier-1')
    expect(result.error).toBe('Cannot delete a tier with sold tickets')
  })

  it('deletes tier when sold_count is 0', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { sold_count: 0, event: { organizer_id: 'org-user' } }, error: null }))
      .mockReturnValueOnce(makeQuery({ error: null }))
    const result = await deleteTier('tier-1')
    expect(result.error).toBeUndefined()
  })
})
