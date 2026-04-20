import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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

const mockImageResponse = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { headers: new Headers({ 'content-type': 'image/png' }), status: 200 }
  })
)
vi.mock('next/og', () => ({ ImageResponse: mockImageResponse }))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { GET } from '@/app/api/events/[id]/recap/route'

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/events/${id}/recap`)
}

describe('GET /api/events/[id]/recap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'org-1' } } })
  })

  it('returns 401 when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when event not found', async () => {
    mockServiceClient.from.mockReturnValue(makeQuery({ data: null, error: null }))
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when event is not ended', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'e-1', state: 'live', title: 'Party', start_at: '2026-04-20T22:00:00Z', organizer_id: 'org-1' }, error: null }))
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns PNG for ended event', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'e-1', state: 'ended', title: 'Party', start_at: '2026-04-20T22:00:00Z', organizer_id: 'org-1' }, error: null }))
      .mockReturnValueOnce(makeQuery({ count: 42 }))
      .mockReturnValueOnce(makeQuery({ data: [] }))

    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(mockImageResponse).toHaveBeenCalled()
  })
})
