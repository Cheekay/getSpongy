import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEq = vi.fn()
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))
const mockServiceClient = { from: mockFrom }

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

global.fetch = vi.fn()

import { sendPushNotification } from '@/lib/notifications'

describe('sendPushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
    })
    mockEq.mockResolvedValue({ data: [{ token: 'ExponentPushToken[abc]', platform: 'ios' }], error: null })
  })

  it('posts to Expo Push API with correct payload when user has tokens', async () => {
    await sendPushNotification('user-1', 'Spot available!', 'A spot opened up.', { eventId: 'ev-1' })

    expect(global.fetch).toHaveBeenCalledOnce()
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    const body = JSON.parse(opts.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]).toMatchObject({
      to: 'ExponentPushToken[abc]',
      title: 'Spot available!',
      body: 'A spot opened up.',
      data: { eventId: 'ev-1' },
    })
  })

  it('skips fetch when user has no tokens', async () => {
    mockEq.mockResolvedValue({ data: [], error: null })
    await sendPushNotification('user-2', 'Hi', 'Body', {})
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('skips fetch on DB error', async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: 'fail' } })
    await sendPushNotification('user-3', 'Hi', 'Body', {})
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
