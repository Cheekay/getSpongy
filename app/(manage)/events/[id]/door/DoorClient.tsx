'use client'

import { useState, useMemo } from 'react'
import { checkInGuest, isDuplicateCheckIn, formatCheckinTime } from '@/lib/actions/checkin'
import type { GuestRow } from '@/lib/actions/checkin'
import Link from 'next/link'

type Props = {
  eventId: string
  eventTitle: string
  capacity: number | null
  initialGuests: GuestRow[]
}

export default function DoorClient({ eventId, eventTitle, capacity, initialGuests }: Props) {
  const [guests, setGuests] = useState<GuestRow[]>(initialGuests)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'warn' | 'error' } | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return guests
    const q = query.toLowerCase()
    return guests.filter(g =>
      g.user.name.toLowerCase().includes(q) ||
      g.user.phone.slice(-4).includes(q)
    )
  }, [guests, query])

  const checkedInCount = guests.filter(g => g.status === 'checked_in').length
  const totalCount = guests.length
  const pct = totalCount > 0 ? Math.round((checkedInCount / (capacity ?? totalCount)) * 100) : 0

  function showToast(message: string, type: 'ok' | 'warn' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCheckIn(rsvpId: string) {
    const prevGuests = guests
    setGuests(prev => prev.map(g =>
      g.id === rsvpId
        ? { ...g, status: 'checked_in', checked_in_at: new Date().toISOString() }
        : g
    ))

    const result = await checkInGuest(rsvpId)

    if (result.error) {
      setGuests(prevGuests)
      showToast(result.error, 'error')
    } else if (result.duplicate) {
      setGuests(prevGuests)
      const guest = prevGuests.find(g => g.id === rsvpId)
      const time = formatCheckinTime(guest?.checked_in_at ?? null)
      showToast(`Already checked in${time ? ` at ${time}` : ''}`, 'warn')
    } else {
      setGuests(prev => prev.map(g =>
        g.id === rsvpId ? { ...g, checked_in_at: result.checkedInAt! } : g
      ))
      showToast('Checked in ✓', 'ok')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between bg-surface-container-low">
        <Link href={`/events/${eventId}`} className="text-on-surface-variant">←</Link>
        <h1 className="font-headline font-bold text-base truncate flex-1 mx-3">{eventTitle}</h1>
        <span className="text-tertiary font-label font-bold text-sm shrink-0">
          {checkedInCount}/{capacity ?? totalCount}
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <input
          type="search"
          placeholder="Search by name or last 4 digits…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-full bg-surface-container-highest px-4 py-2 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary text-sm"
        />
      </div>

      {/* Guest list */}
      <div className="flex-1 px-4 space-y-2 overflow-y-auto">
        {filtered.map(guest => (
          <div key={guest.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center gap-3">
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
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-label font-semibold transition-all ${
          toast.type === 'ok' ? 'bg-tertiary text-on-tertiary' :
          toast.type === 'warn' ? 'bg-primary text-on-primary' :
          'bg-error text-on-error'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
