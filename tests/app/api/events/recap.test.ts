import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockSupabaseClient, mockServiceClient, mockImageResponse } = vi.hoisted(() => {
  const mockSupabaseClient = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }
  const mockServiceClient = { from: vi.fn() }
  const mockImageResponse = vi.fn().mockImplementation(function () {
    return {
      headers: new Headers({ 'content-type': 'image/png' }),
      status: 200,
    }
  })
  return { mockSupabaseClient, mockServiceClient, mockImageResponse }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

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
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
  })

  it('returns 404 when event not found', async () => {
    mockServiceClient.from.mockReturnValue(makeQuery({ data: null, error: null }))
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when event is not ended', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'e-1', state: 'live', title: 'Party', start_at: '2026-04-20T22:00:00Z' }, error: null }))
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns PNG for ended event', async () => {
    mockServiceClient.from
      .mockReturnValueOnce(makeQuery({ data: { id: 'e-1', state: 'ended', title: 'Party', start_at: '2026-04-20T22:00:00Z' }, error: null }))
      .mockReturnValueOnce(makeQuery({ count: 42 })) // attendance
      .mockReturnValueOnce(makeQuery({ data: [] })) // top tracks

    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(mockImageResponse).toHaveBeenCalled()
  })
})
