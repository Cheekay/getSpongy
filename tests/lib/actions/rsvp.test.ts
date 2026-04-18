import { describe, it, expect } from 'vitest'
import { isEventAtCapacity } from '@/lib/actions/rsvp'

describe('isEventAtCapacity', () => {
  it('returns false when capacity is null (unlimited)', () => {
    expect(isEventAtCapacity(null, 999)).toBe(false)
  })

  it('returns false when rsvp count is below capacity', () => {
    expect(isEventAtCapacity(100, 50)).toBe(false)
  })

  it('returns true when rsvp count equals capacity', () => {
    expect(isEventAtCapacity(100, 100)).toBe(true)
  })

  it('returns true when rsvp count exceeds capacity', () => {
    expect(isEventAtCapacity(100, 150)).toBe(true)
  })
})
