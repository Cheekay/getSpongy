'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { checkInGuest, formatCheckinTime, verifyAndCheckIn } from '@/lib/actions/checkin'
import {
  cacheGuestList,
  getCachedGuestList,
  updateCachedGuestStatus,
  queueCheckIn,
  getCheckInQueue,
  clearCheckInQueue,
  type OfflineGuest,
} from '@/lib/offline'
import type { GuestRow } from '@/lib/actions/checkin'
import Link from 'next/link'

const QrScannerWidget = dynamic(
  () => import('./QrScannerWidget').then((m) => m.QrScannerWidget),
  { ssr: false }
)

type Tab = 'search' | 'scan'
type Toast = { message: string; type: 'ok' | 'warn' | 'error' }

type Props = {
  eventId: string
  eventTitle: string
  capacity: number | null
  initialGuests: GuestRow[]
}

export default function DoorClient({ eventId, eventTitle, capacity, initialGuests }: Props) {
  const [guests, setGuests] = useState<GuestRow[]>(initialGuests)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('search')
  const [toast, setToast] = useState<Toast | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const scanLockRef = useRef(false)

  // Cache guest list on mount and track online status
  useEffect(() => {
    const offlineGuests: OfflineGuest[] = guests.map((g) => ({
      id: g.id,
      user: g.user,
      status: g.status,
      checked_in_at: g.checked_in_at,
    }))
    cacheGuestList(eventId, offlineGuests)

    const handleOnline = async () => {
      setIsOnline(true)
      await flushOfflineQueue()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function flushOfflineQueue() {
    const queue = getCheckInQueue(eventId)
    if (queue.length === 0) return
    for (const item of queue) {
      await checkInGuest(item.rsvpId)
    }
    clearCheckInQueue(eventId)
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return guests
    const q = query.toLowerCase()
    return guests.filter(
      (g) =>
        g.user.name.toLowerCase().includes(q) ||
        g.user.phone.slice(-4).includes(q)
    )
  }, [guests, query])

  const checkedInCount = guests.filter((g) => g.status === 'checked_in').length
  const totalCount = guests.length
  const pct = totalCount > 0 ? Math.round((checkedInCount / (capacity ?? totalCount)) * 100) : 0

  function showToast(message: string, type: Toast['type']) {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  function applyCheckIn(rsvpId: string) {
    const now = new Date().toISOString()
    setGuests((prev) =>
      prev.map((g) =>
        g.id === rsvpId ? { ...g, status: 'checked_in', checked_in_at: now } : g
      )
    )
    updateCachedGuestStatus(eventId, rsvpId)
  }

  async function handleCheckIn(rsvpId: string) {
    const prev = guests
    applyCheckIn(rsvpId)

    if (!isOnline) {
      queueCheckIn(eventId, rsvpId)
      showToast('Checked in (offline — will sync)', 'ok')
      return
    }

    const result = await checkInGuest(rsvpId)
    if (result.error) {
      setGuests(prev)
      showToast(result.error, 'error')
    } else if (result.duplicate) {
      setGuests(prev)
      const guest = prev.find((g) => g.id === rsvpId)
      const time = formatCheckinTime(guest?.checked_in_at ?? null)
      showToast(`Already checked in${time ? ` at ${time}` : ''}`, 'warn')
    } else {
      setGuests((cur) =>
        cur.map((g) => (g.id === rsvpId ? { ...g, checked_in_at: result.checkedInAt! } : g))
      )
      showToast('Checked in ✓', 'ok')
    }
  }

  const handleQrScan = useCallback(async (text: string) => {
    if (scanLockRef.current) return
    scanLockRef.current = true
    setTimeout(() => { scanLockRef.current = false }, 1500)

    if (!isOnline) {
      // Offline: decode JWT payload without verification, look up rsvpId in cache
      try {
        const parts = text.split('.')
        if (parts.length < 2) throw new Error('bad format')
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        const rsvpId = payload.rsvpId as string
        const cached = getCachedGuestList(eventId)
        const guest = cached?.find((g) => g.id === rsvpId)
        if (!guest) { showToast('QR not recognised', 'error'); return }
        if (guest.status === 'checked_in') { showToast('Already checked in', 'warn'); return }
        applyCheckIn(rsvpId)
        queueCheckIn(eventId, rsvpId)
        showToast('Checked in (offline)', 'ok')
      } catch {
        showToast('Invalid QR code', 'error')
      }
      return
    }

    const result = await verifyAndCheckIn(text)
    if (result.error) {
      showToast(result.error, 'error')
    } else if (result.duplicate) {
      showToast('Already checked in', 'warn')
    } else {
      // Find the rsvpId from the JWT payload to update local state
      try {
        const parts = text.split('.')
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        applyCheckIn(payload.rsvpId)
      } catch { /* local state will sync on next page load */ }
      showToast('Checked in ✓', 'ok')
    }
  }, [eventId, isOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between bg-surface-container-low">
        <Link href={`/events/${eventId}`} className="text-on-surface-variant">←</Link>
        <h1 className="font-headline font-bold text-base truncate flex-1 mx-3">{eventTitle}</h1>
        <div className="flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="text-xs font-label font-semibold text-error bg-error/10 px-2 py-0.5 rounded-full">
              Offline
            </span>
          )}
          <span className="text-tertiary font-label font-bold text-sm">
            {checkedInCount}/{capacity ?? totalCount}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-outline-variant">
        {(['search', 'scan'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-label font-semibold capitalize transition-colors ${
              tab === t
                ? 'text-secondary border-b-2 border-secondary'
                : 'text-on-surface-variant'
            }`}
          >
            {t === 'search' ? 'Search' : 'Scan QR'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'search' && (
        <>
          <div className="px-4 py-3">
            <input
              type="search"
              placeholder="Search by name or last 4 digits…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-full bg-surface-container-highest px-4 py-2 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary text-sm"
            />
          </div>

          <div className="flex-1 px-4 space-y-2 overflow-y-auto">
            {filtered.map((guest) => (
              <div
                key={guest.id}
                className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant text-sm font-bold shrink-0">
                  {guest.user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-label font-semibold text-on-surface truncate">{guest.user.name}</p>
                  <p className="text-on-surface-variant text-xs">
                    {guest.status === 'checked_in'
                      ? `Checked in · ${formatCheckinTime(guest.checked_in_at)}`
                      : 'RSVPd'}
                  </p>
                </div>
                {guest.status === 'checked_in' ? (
                  <span className="text-tertiary text-lg">✓</span>
                ) : (
                  <button
                    onClick={() => handleCheckIn(guest.id)}
                    className="px-3 py-1.5 rounded-full ring-1 ring-secondary/40 text-secondary text-xs font-label font-semibold shrink-0"
                  >
                    Check In
                  </button>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-on-surface-variant text-center py-8 text-sm">No guests found</p>
            )}
          </div>
        </>
      )}

      {tab === 'scan' && (
        <div className="flex-1 px-4">
          <QrScannerWidget onScan={handleQrScan} />
        </div>
      )}

      {/* Stats bar */}
      <div className="px-4 py-3 bg-surface-container-lowest flex justify-around text-on-surface-variant text-xs">
        <span>{checkedInCount} checked in</span>
        <span>·</span>
        <span>{totalCount - checkedInCount} remaining</span>
        <span>·</span>
        <span>{pct}% capacity</span>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-label font-semibold transition-all ${
            toast.type === 'ok'
              ? 'bg-tertiary text-on-tertiary'
              : toast.type === 'warn'
              ? 'bg-primary text-on-primary'
              : 'bg-error text-on-error'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
