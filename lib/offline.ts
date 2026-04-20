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

type QueuedCheckIn = {
  rsvpId: string
  queuedAt: string
}

const guestKey  = (eventId: string) => `spongy_offline_${eventId}`
const queueKey  = (eventId: string) => `spongy_queue_${eventId}`

export function cacheGuestList(eventId: string, guests: OfflineGuest[]): void {
  const cache: OfflineCache = { downloadedAt: new Date().toISOString(), guests }
  localStorage.setItem(guestKey(eventId), JSON.stringify(cache))
}

export function getCachedGuestList(eventId: string): OfflineGuest[] | null {
  const raw = localStorage.getItem(guestKey(eventId))
  if (!raw) return null
  return (JSON.parse(raw) as OfflineCache).guests
}

export function updateCachedGuestStatus(eventId: string, rsvpId: string): void {
  const raw = localStorage.getItem(guestKey(eventId))
  if (!raw) return
  const cache = JSON.parse(raw) as OfflineCache
  cache.guests = cache.guests.map((g) =>
    g.id === rsvpId
      ? { ...g, status: 'checked_in', checked_in_at: new Date().toISOString() }
      : g
  )
  localStorage.setItem(guestKey(eventId), JSON.stringify(cache))
}

export function queueCheckIn(eventId: string, rsvpId: string): void {
  const raw = localStorage.getItem(queueKey(eventId))
  const queue: QueuedCheckIn[] = raw ? JSON.parse(raw) : []
  if (!queue.find((q) => q.rsvpId === rsvpId)) {
    queue.push({ rsvpId, queuedAt: new Date().toISOString() })
    localStorage.setItem(queueKey(eventId), JSON.stringify(queue))
  }
}

export function getCheckInQueue(eventId: string): QueuedCheckIn[] {
  const raw = localStorage.getItem(queueKey(eventId))
  return raw ? JSON.parse(raw) : []
}

export function clearCheckInQueue(eventId: string): void {
  localStorage.removeItem(queueKey(eventId))
}
