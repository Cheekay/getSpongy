'use client'

import { useState } from 'react'
import { assignDj } from '@/lib/actions/moderation'

export default function DjAssignForm({ eventId }: { eventId: string }) {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return
    setSubmitting(true)
    setStatus(null)
    const result = await assignDj(eventId, phone.trim())
    setSubmitting(false)
    if (result.error) {
      setStatus(result.error)
    } else {
      setStatus(`DJ assigned: ${result.djName}`)
      setPhone('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="tel"
        placeholder="DJ's phone number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="flex-1 rounded-xl bg-surface-container-highest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary"
      />
      <button
        type="submit"
        disabled={submitting}
        className="px-3 py-2 rounded-xl bg-secondary text-on-secondary text-sm font-label font-semibold disabled:opacity-50"
      >
        {submitting ? '…' : 'Assign'}
      </button>
      {status && (
        <p className={`text-xs mt-1 ${status.startsWith('DJ assigned') ? 'text-tertiary' : 'text-error'}`}>
          {status}
        </p>
      )}
    </form>
  )
}
