'use client'

import { useState, useRef, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { submitTip } from '@/lib/actions/tips'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

type TipPreset = 100 | 200 | 500
const PRESETS: TipPreset[] = [100, 200, 500]

function TipFormInner({
  requestId,
  minTipCents,
  onSuccess,
  onClose,
}: {
  requestId: string
  minTipCents: number
  onSuccess: () => void
  onClose: () => void
}) {
  const stripeInstance = useStripe()
  const elements = useElements()
  const [preset, setPreset] = useState<TipPreset | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
    focusable[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const amountCents = preset ?? (customAmount ? Math.round(parseFloat(customAmount) * 100) : 0)

  async function handleSubmit() {
    if (!amountCents || amountCents < minTipCents) {
      setError(`Minimum tip is $${(minTipCents / 100).toFixed(2)}`)
      return
    }
    setError(null)
    setLoading(true)

    let secret = clientSecret
    if (!secret) {
      const result = await submitTip({ requestId, amountCents, note: note.trim() || undefined })
      if (result.error) { setError(result.error); setLoading(false); return }
      secret = result.clientSecret!
      setClientSecret(secret)
    }

    if (!stripeInstance || !elements || !secret) { setLoading(false); return }

    const card = elements.getElement(CardElement)
    if (!card) { setLoading(false); return }

    const { error: stripeError } = await stripeInstance.confirmCardPayment(secret, {
      payment_method: { card },
    })

    setLoading(false)
    if (stripeError) { setError(stripeError.message ?? 'Payment failed'); return }
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Send a tip"
        className="w-full max-w-md bg-surface rounded-t-3xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-headline text-xl font-bold">Send a Tip</h2>
          <button onClick={onClose} aria-label="Close tip modal" className="text-on-surface-variant text-2xl hover:opacity-80 transition-opacity">✕</button>
        </div>

        <div className="flex gap-3">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => { setPreset(p); setCustomAmount('') }}
              className={`flex-1 py-2.5 rounded-full font-label font-semibold text-sm transition-colors ${
                preset === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
              }`}
            >
              ${(p / 100).toFixed(0)}
            </button>
          ))}
          <button
            onClick={() => setPreset(null)}
            className={`flex-1 py-2.5 rounded-full font-label font-semibold text-sm transition-colors ${
              preset === null && !customAmount ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
            }`}
          >
            Other
          </button>
        </div>

        {preset === null && (
          <input
            type="number"
            placeholder="Amount ($)"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            min={minTipCents / 100}
            step="0.01"
            className="w-full bg-surface-container-highest rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
          />
        )}

        <input
          type="text"
          placeholder="Add a note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={80}
          className="w-full bg-surface-container-highest rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary text-sm"
        />

        <div className="bg-surface-container-highest rounded-xl px-4 py-4">
          <CardElement
            options={{
              style: {
                base: { color: '#f8f5fd', fontSize: '16px', '::placeholder': { color: '#acaab1' } },
                invalid: { color: '#f87171' },
              },
            }}
          />
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading || !amountCents}
          className="w-full py-3.5 rounded-full bg-primary text-on-primary font-label font-semibold disabled:opacity-50"
        >
          {loading ? 'Sending…' : `Send $${amountCents ? (amountCents / 100).toFixed(2) : '—'} Tip`}
        </button>

        <p className="text-center text-on-surface-variant text-xs">Tips are non-refundable</p>
      </div>
    </div>
  )
}

export default function TipModal(props: {
  requestId: string
  minTipCents: number
  onSuccess: () => void
  onClose: () => void
}) {
  return (
    <Elements stripe={stripePromise}>
      <TipFormInner {...props} />
    </Elements>
  )
}
