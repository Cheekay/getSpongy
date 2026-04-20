// Default vitest environment is jsdom, which provides localStorage
import { describe, it, expect, beforeEach } from 'vitest'
import {
  cacheGuestList,
  getCachedGuestList,
  updateCachedGuestStatus,
  queueCheckIn,
  getCheckInQueue,
  clearCheckInQueue,
} from '@/lib/offline'

const EVENT_ID = 'ev-test'

const guests = [
  { id: 'r1', user: { name: 'Alice', phone: '+14155550001' }, status: 'rsvpd', checked_in_at: null },
  { id: 'r2', user: { name: 'Bob',   phone: '+14155550002' }, status: 'rsvpd', checked_in_at: null },
]

describe('cacheGuestList / getCachedGuestList', () => {
  beforeEach(() => localStorage.clear())

  it('stores and retrieves guest list', () => {
    cacheGuestList(EVENT_ID, guests)
    const result = getCachedGuestList(EVENT_ID)
    expect(result).toHaveLength(2)
    expect(result![0].user.name).toBe('Alice')
  })

  it('returns null when no cache exists', () => {
    expect(getCachedGuestList('no-such-event')).toBeNull()
  })
})

describe('updateCachedGuestStatus', () => {
  beforeEach(() => {
    localStorage.clear()
    cacheGuestList(EVENT_ID, guests)
  })

  it('marks a guest as checked_in in the cache', () => {
    updateCachedGuestStatus(EVENT_ID, 'r1')
    const cached = getCachedGuestList(EVENT_ID)!
    const alice = cached.find((g) => g.id === 'r1')!
    expect(alice.status).toBe('checked_in')
    expect(alice.checked_in_at).not.toBeNull()
  })

  it('does not affect other guests', () => {
    updateCachedGuestStatus(EVENT_ID, 'r1')
    const cached = getCachedGuestList(EVENT_ID)!
    const bob = cached.find((g) => g.id === 'r2')!
    expect(bob.status).toBe('rsvpd')
  })
})

describe('check-in queue', () => {
  beforeEach(() => localStorage.clear())

  it('queues a check-in', () => {
    queueCheckIn(EVENT_ID, 'r1')
    const queue = getCheckInQueue(EVENT_ID)
    expect(queue).toHaveLength(1)
    expect(queue[0].rsvpId).toBe('r1')
  })

  it('does not duplicate the same rsvpId', () => {
    queueCheckIn(EVENT_ID, 'r1')
    queueCheckIn(EVENT_ID, 'r1')
    expect(getCheckInQueue(EVENT_ID)).toHaveLength(1)
  })

  it('queues multiple distinct rsvpIds', () => {
    queueCheckIn(EVENT_ID, 'r1')
    queueCheckIn(EVENT_ID, 'r2')
    expect(getCheckInQueue(EVENT_ID)).toHaveLength(2)
  })

  it('clearCheckInQueue removes all entries', () => {
    queueCheckIn(EVENT_ID, 'r1')
    clearCheckInQueue(EVENT_ID)
    expect(getCheckInQueue(EVENT_ID)).toHaveLength(0)
  })
})
