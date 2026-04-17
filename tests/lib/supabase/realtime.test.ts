import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRemoveChannel = vi.fn()
const mockSubscribe = vi.fn().mockReturnThis()
const mockOn = vi.fn().mockReturnThis()
const mockChannel = vi.fn().mockReturnValue({
  on: mockOn,
  subscribe: mockSubscribe,
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}))

import { subscribeToRequests, subscribeToCheckIns } from '@/lib/supabase/realtime'

describe('subscribeToRequests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('subscribes to the correct event-scoped channel', () => {
    subscribeToRequests('event-123', vi.fn())
    expect(mockChannel).toHaveBeenCalledWith('requests:event-123')
  })

  it('listens on the song_requests table', () => {
    subscribeToRequests('event-123', vi.fn())
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'song_requests', filter: 'event_id=eq.event-123' }),
      expect.any(Function)
    )
  })

  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeToRequests('event-123', vi.fn())
    expect(typeof unsubscribe).toBe('function')
  })

  it('calls removeChannel when unsubscribed', () => {
    const unsubscribe = subscribeToRequests('event-123', vi.fn())
    unsubscribe()
    expect(mockRemoveChannel).toHaveBeenCalledOnce()
  })
})

describe('subscribeToCheckIns', () => {
  beforeEach(() => vi.clearAllMocks())

  it('subscribes to the correct event-scoped channel', () => {
    subscribeToCheckIns('event-456', vi.fn())
    expect(mockChannel).toHaveBeenCalledWith('checkins:event-456')
  })

  it('listens on the rsvps table', () => {
    subscribeToCheckIns('event-456', vi.fn())
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'rsvps', filter: 'event_id=eq.event-456' }),
      expect.any(Function)
    )
  })

  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeToCheckIns('event-456', vi.fn())
    expect(typeof unsubscribe).toBe('function')
  })
})
