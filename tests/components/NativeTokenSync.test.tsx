import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { NativeTokenSync } from '@/components/NativeTokenSync'

global.fetch = vi.fn()

describe('NativeTokenSync', () => {
  afterEach(() => vi.clearAllMocks())

  it('calls /api/notifications/register when nativePushToken event fires', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

    render(<NativeTokenSync />)

    window.dispatchEvent(
      new CustomEvent('nativePushToken', {
        detail: { token: 'ExponentPushToken[abc]', platform: 'ios' },
      })
    )

    await Promise.resolve()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'ExponentPushToken[abc]', platform: 'ios' }),
      })
    )
  })

  it('does nothing when no event is fired', () => {
    render(<NativeTokenSync />)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
