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

import { updateTipSettings } from '@/lib/actions/events'

describe('updateTipSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthUser = mockUser
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockAuthUser } })
  })

  it('returns error when not authenticated', async () => {
    mockAuthUser = null
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const formData = new FormData()
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBe('Unauthorized')
  })

  it('returns error when event not found', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: null }))
    const formData = new FormData()
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBe('Not found')
  })

  it('returns error when user is not the organizer', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'draft', organizer_id: 'other-user' } }))
    const formData = new FormData()
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBe('Not found')
  })

  it('returns error when event is live', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'live', organizer_id: 'org-user' } }))
    const formData = new FormData()
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBe('Cannot change tip settings after going live')
  })

  it('returns error when event is ended', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'ended', organizer_id: 'org-user' } }))
    const formData = new FormData()
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBe('Cannot change tip settings after going live')
  })

  it('updates tip settings successfully', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'draft', organizer_id: 'org-user' } }))
      .mockReturnValueOnce(makeQuery({ data: [{ id: 'event-1' }], error: null }))
    const formData = new FormData()
    formData.set('tipsEnabled', 'on')
    formData.set('minTipCents', '250')
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBeUndefined()
  })

  it('returns error when update matched 0 rows', async () => {
    mockSupabaseClient.from
      .mockReturnValueOnce(makeQuery({ data: { state: 'draft', organizer_id: 'org-user' } }))
      .mockReturnValueOnce(makeQuery({ data: [], error: null }))
    const formData = new FormData()
    const result = await updateTipSettings('event-1', formData)
    expect(result.error).toBe('Event not found')
  })
})
