'use client'

import { useState } from 'react'
import { initiateTransfer } from '@/lib/actions/transfers'

export default function TransferPage({ params }: { params: { rsvpId: string } }) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await initiateTransfer({ rsvpId: params.rsvpId, recipientPhone: phone })
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setDone(true)
  }

  if (done) {
    return (
      <main className="px-4 py-12 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold">Transfer Sent</h1>
        <p className="text-on-surface-variant text-sm">A claim link has been sent to {phone}. Your ticket is on hold for 24 hours.</p>
        <a href="/tickets" className="text-secondary text-sm">Back to my tickets →</a>
      </main>
    )
  }

  return (
    <main className="px-4 py-12 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Transfer Ticket</h1>
      <p className="text-on-surface-variant text-sm">Enter the recipient's phone number. They'll receive a one-time claim link (valid 24h).</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          type="tel"
          placeholder="+1 (555) 000-0000"
          required
          className="w-full bg-surface-container-highest rounded-lg px-3 py-3 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        {error && <p className="text-error text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-full bg-primary text-on-primary font-label font-semibold disabled:opacity-60"
        >
          {loading ? 'Sending…' : 'Send Transfer Link'}
        </button>
      </form>
    </main>
  )
}
