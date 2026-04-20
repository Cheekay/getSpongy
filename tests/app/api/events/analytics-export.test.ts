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

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { GET } from '@/app/api/events/[id]/analytics/export/route'

function makeRequest(eventId: string) {
  return new NextRequest(`http://localhost/api/events/${eventId}/analytics/export`)
}

describe('GET /api/events/[id]/analytics/export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when event not found or not owned', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    mockSupabaseClient.from.mockReturnValue(makeQuery({ data: null, error: { message: 'not found' } }))
    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns CSV with correct headers', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'org-1' } } })
    mockSupabaseClient.from.mockReturnValue(makeQuery({ data: { id: 'e-1', organizer_id: 'org-1' }, error: null }))
    mockServiceClient.from.mockReturnValue(makeQuery({
      data: [
        { track_title: 'Song A', track_artist: 'Artist 1', state: 'played', upvote_count: 5, tip_cents: 200, created_at: '2026-04-20T22:00:00Z' },
        { track_title: 'Song, B', track_artist: 'Artist 2', state: 'rejected', upvote_count: 0, tip_cents: 0, created_at: '2026-04-20T22:05:00Z' },
      ],
      error: null,
    }))

    const res = await GET(makeRequest('e-1'), { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    const text = await res.text()
    expect(text).toContain('track_title,track_artist,state,upvotes,tip_cents,requested_at')
    expect(text).toContain('Song A')
    expect(text).toContain('"Song, B"') // CSV-escaped for comma
  })
})
