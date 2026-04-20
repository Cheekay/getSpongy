'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { rsvpToEvent } from '@/lib/actions/rsvp'
import { createPaymentIntent } from '@/lib/actions/checkout'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { QRCodeSVG } from 'qrcode.react'
import { format } from 'date-fns-tz'

const PaymentForm = dynamic(() => import('./PaymentForm'), { ssr: false })

type Tier = { id: string; name: string; price_cents: number; inventory: number | null; sold_count: number; active: boolean }

type EventPageClientProps = {
  event: {
    id: string
    title: string
    description: string | null
    cover_image_url: string | null
    start_at: string
    end_at: string
    timezone: string
    venue_name: string | null
    state: string
    capacity: number | null
    event_code: string
    rsvp_type: string
    organizer: { name: string } | null
  }
  user: { id: string } | null
  hasProfile: boolean
  existingRsvp: { id: string; qr_jwt: string | null } | null
  rsvpCount: number
  atCapacity: boolean
  appUrl: string
  tiers: Tier[]
}

export default function EventPageClient({
  event, user, hasProfile, existingRsvp, rsvpCount, atCapacity, appUrl, tiers,
}: EventPageClientProps) {
  const router = useRouter()
  const [rsvp, setRsvp] = useState(existingRsvp)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null)
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null)
  const [checkoutRsvpId, setCheckoutRsvpId] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const eventUrl = `${appUrl}/e/${event.event_code}`
  const dateStr = format(new Date(event.start_at), 'EEE MMM d · h:mm a zzz', { timeZone: event.timezone })

  async function handleRsvp() {
    if (!user) {
      router.push(`/login?redirect=/e/${event.event_code}`)
      return
    }
    if (!hasProfile) {
      router.push(`/setup?redirect=/e/${event.event_code}`)
      return
    }
    setLoading(true)
    setError(null)
    const result = await rsvpToEvent(event.id)
    if (result.error) { setError(result.error); setLoading(false); return }
    setRsvp({ id: result.rsvpId!, qr_jwt: result.qrJwt! })
    setLoading(false)
  }

  async function handleSelectTier(tier: Tier) {
    setSelectedTier(tier)
    setPaymentError(null)
    if (!user) { router.push(`/login?redirect=/e/${event.event_code}`); return }
    if (!hasProfile) { router.push(`/setup?redirect=/e/${event.event_code}`); return }
    setLoading(true)
    const result = await createPaymentIntent({ eventId: event.id, tierId: tier.id })
    setLoading(false)
    if (result.error) { setPaymentError(result.error); return }
    setCheckoutSecret(result.clientSecret!)
    setCheckoutRsvpId(result.rsvpId!)
  }

  function handlePaymentSuccess(qrJwt: string) {
    setRsvp({ id: checkoutRsvpId!, qr_jwt: qrJwt })
  }

  if (rsvp?.qr_jwt) {
    return <RsvpConfirmation event={event} qrJwt={rsvp.qr_jwt} eventUrl={eventUrl} />
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Hero */}
      <div className="relative w-full aspect-video">
        {event.cover_image_url && (
          <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover rounded-b-xl" />
        )}
        <div className="absolute bottom-3 left-3">
          {event.rsvp_type === 'free' && <Chip variant="live">FREE ENTRY</Chip>}
        </div>
      </div>

      {/* Info card */}
      <div className="mx-4 -mt-6 bg-surface-container-low rounded-xl p-4 space-y-2 relative z-10">
        <h1 className="font-headline text-2xl font-bold">{event.title}</h1>
        <p className="text-on-surface-variant text-sm uppercase tracking-wider">{dateStr}</p>
        {event.venue_name && (
          <p className="text-on-surface text-sm">📍 {event.venue_name}</p>
        )}
        {event.organizer && (
          <p className="text-on-surface-variant text-sm">Hosted by {event.organizer.name}</p>
        )}
      </div>

      {/* Description */}
      {event.description && (
        <div className="mx-4 mt-4">
          <p className="text-on-surface-variant">{event.description}</p>
        </div>
      )}

      {/* Attendees */}
      <div className="mx-4 mt-4">
        <p className="text-on-surface-variant text-sm">{rsvpCount} people going</p>
      </div>

      {error && <p className="mx-4 mt-2 text-error text-sm">{error}</p>}

      {event.rsvp_type === 'paid' ? (
        <div className="px-4 py-4 space-y-4">
          {!checkoutSecret && (
            <div className="space-y-3">
              <p className="font-label font-semibold text-on-surface">Choose your ticket</p>
              {tiers.map((tier) => {
                const soldOut = tier.inventory !== null && tier.sold_count >= tier.inventory
                return (
                  <button
                    key={tier.id}
                    onClick={() => !soldOut && handleSelectTier(tier)}
                    disabled={soldOut || loading}
                    className={`w-full flex items-center justify-between rounded-xl p-4 text-left transition-colors ${
                      soldOut ? 'bg-surface-container opacity-50 cursor-not-allowed' : 'bg-surface-container-low active:bg-surface-container'
                    } ${selectedTier?.id === tier.id ? 'ring-2 ring-primary' : ''}`}
                  >
                    <span className="font-label font-semibold text-on-surface">{tier.name}</span>
                    <span className="text-on-surface-variant text-sm">
                      {soldOut ? 'Sold out' : `$${(tier.price_cents / 100).toFixed(2)}`}
                    </span>
                  </button>
                )
              })}
              {paymentError && <p className="text-error text-sm">{paymentError}</p>}
            </div>
          )}
          {checkoutSecret && checkoutRsvpId && (
            <PaymentForm
              clientSecret={checkoutSecret}
              rsvpId={checkoutRsvpId}
              onSuccess={handlePaymentSuccess}
              onError={(msg) => { setPaymentError(msg); setCheckoutSecret(null) }}
            />
          )}
        </div>
      ) : (
        /* Free RSVP sticky CTA */
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-container-lowest flex items-center gap-4">
          <span className="text-on-surface-variant text-sm">Free Event</span>
          <Button
            className="flex-1"
            onClick={handleRsvp}
            disabled={loading || atCapacity}
          >
            {atCapacity ? 'Event Full' : loading ? 'RSVPing…' : 'RSVP Free'}
          </Button>
        </div>
      )}
    </div>
  )
}

function RsvpConfirmation({
  event, qrJwt, eventUrl,
}: {
  event: EventPageClientProps['event']
  qrJwt: string
  eventUrl: string
}) {
  return (
    <div className="min-h-screen px-4 py-12 flex flex-col items-center space-y-6">
      <div className="text-center space-y-1">
        <h1 className="font-headline text-3xl font-bold">You're in!</h1>
        <p className="text-on-surface-variant">Your RSVP for {event.title} is confirmed.</p>
      </div>

      <div className="bg-surface-container rounded-xl p-6 flex flex-col items-center space-y-3">
        <QRCodeSVG value={qrJwt} size={180} bgColor="transparent" fgColor="#f8f5fd" />
        <p className="text-secondary text-sm">Show this at the door</p>
        <p className="text-on-surface-variant text-xs">
          {event.title} · {new Date(event.start_at).toLocaleDateString()}
        </p>
      </div>

      <div className="flex gap-3 w-full">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => navigator.share?.({ url: eventUrl, title: event.title })}
        >
          Share Event
        </Button>
      </div>

      <Button className="w-full" onClick={() => { window.location.href = `/live/${event.id}` }}>
        🎵 Submit a Song Request
      </Button>
    </div>
  )
}
