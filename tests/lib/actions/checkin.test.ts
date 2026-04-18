import { describe, it, expect } from 'vitest'
import { isDuplicateCheckIn, formatCheckinTime } from '@/lib/actions/checkin'

describe('isDuplicateCheckIn', () => {
  it('returns true for checked_in status', () => {
    expect(isDuplicateCheckIn('checked_in')).toBe(true)
  })

  it('returns false for rsvpd status', () => {
    expect(isDuplicateCheckIn('rsvpd')).toBe(false)
  })

  it('returns false for paid status', () => {
    expect(isDuplicateCheckIn('paid')).toBe(false)
  })
})

describe('formatCheckinTime', () => {
  it('formats an ISO timestamp to time only', () => {
    const ts = '2026-05-03T21:43:00.000Z'
    const result = formatCheckinTime(ts)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })

  it('returns empty string for null', () => {
    expect(formatCheckinTime(null)).toBe('')
  })
})
