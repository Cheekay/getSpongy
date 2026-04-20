export type OfflineGuest = {
  id: string
  user: { name: string; phone: string }
  status: string
  checked_in_at: string | null
}

type OfflineCache = {
  downloadedAt: string
  guests: OfflineGuest[]
}

export type QueuedCheckIn = {
  rsvpId: string
  queuedAt: string
}

function storage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('[offline] localStorage is not available in a server context')
  }
  return window.localStorage
}

const guestKey  = (eventId: string) => `spongy_offline_${eventId}`
const queueKey  = (eventId: string) => `spongy_queue_${eventId}`

export function cacheGuestList(eventId: string, guests: OfflineGuest[]): void {
  const cache: OfflineCache = { downloadedAt: new Date().toISOString(), guests }
  storage().setItem(guestKey(eventId), JSON.stringify(cache))
}

export function getCachedGuestList(eventId: string): OfflineGuest[] | null {
  const raw = storage().getItem(guestKey(eventId))
  if (!raw) return null
  try {
    return (JSON.parse(raw) as OfflineCache).guests
  } catch {
    return null
  }
}

export function updateCachedGuestStatus(eventId: string, rsvpId: string): void {
  const raw = storage().getItem(guestKey(eventId))
  if (!raw) return
  let cache: OfflineCache
  try {
    cache = JSON.parse(raw) as OfflineCache
  } catch {
    return
  }
  cache.guests = cache.guests.map((g) =>
    g.id === rsvpId
      ? { ...g, status: 'checked_in', checked_in_at: new Date().toISOString() }
      : g
  )
  storage().setItem(guestKey(eventId), JSON.stringify(cache))
}

export function queueCheckIn(eventId: string, rsvpId: string): void {
  const raw = storage().getItem(queueKey(eventId))
  let queue: QueuedCheckIn[]
  try {
    queue = raw ? JSON.parse(raw) : []
  } catch {
    queue = []
  }
  if (!queue.find((q) => q.rsvpId === rsvpId)) {
    queue.push({ rsvpId, queuedAt: new Date().toISOString() })
    storage().setItem(queueKey(eventId), JSON.stringify(queue))
  }
}

export function getCheckInQueue(eventId: string): QueuedCheckIn[] {
  const raw = storage().getItem(queueKey(eventId))
  if (!raw) return []
  try {
    return JSON.parse(raw) as QueuedCheckIn[]
  } catch {
    return []
  }
}

export function clearCheckInQueue(eventId: string): void {
  storage().removeItem(queueKey(eventId))
}
