import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUpsert = vi.fn()
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }))
const mockGetUser = vi.fn()
const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

import { POST } from '@/app/api/notifications/register/route'

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/notifications/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/notifications/register', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ token: 'ExponentPushToken[x]', platform: 'ios' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when token is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const res = await POST(makeReq({ platform: 'android' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when platform is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const res = await POST(makeReq({ token: 'ExponentPushToken[x]' }))
    expect(res.status).toBe(400)
  })

  it('upserts token and returns 200', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    mockUpsert.mockResolvedValue({ error: null })

    const res = await POST(makeReq({ token: 'ExponentPushToken[x]', platform: 'ios' }))

    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledWith('device_tokens')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-1', token: 'ExponentPushToken[x]', platform: 'ios' }),
      { onConflict: 'user_id,token' }
    )
  })

  it('returns 500 on DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    mockUpsert.mockResolvedValue({ error: { message: 'db fail' } })

    const res = await POST(makeReq({ token: 'ExponentPushToken[x]', platform: 'ios' }))
    expect(res.status).toBe(500)
  })
})
