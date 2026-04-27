'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ExplorePage() {
  const router = useRouter()
  const [code, setCode] = useState('')

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    router.push(`/e/${trimmed}`)
  }

  return (
    <main className="px-4 py-6 pb-24">
      <h1 className="font-headline text-3xl font-bold">
        Find the <span className="text-primary">Pulse.</span>
      </h1>
      <p className="text-on-surface-variant mt-2 text-sm">Have an event code? Jump straight in.</p>

      <form onSubmit={handleJoin} className="mt-6 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Event code (e.g. SPONGY)"
          maxLength={6}
          aria-label="Event code"
          className="flex-1 rounded-full bg-surface-container-highest px-4 py-3 text-on-surface uppercase placeholder:normal-case placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary text-sm tracking-widest"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="px-5 py-3 rounded-full bg-primary text-on-primary font-label font-semibold text-sm disabled:opacity-50 hover:opacity-90 active:scale-95 transition-all"
        >
          Join
        </button>
      </form>

      <div className="mt-10 flex flex-col items-center text-center py-8 text-on-surface-variant">
        <p className="text-4xl mb-3">🎉</p>
        <p className="font-label font-semibold text-on-surface">Event discovery coming soon</p>
        <p className="text-sm mt-1">Browse and discover public events in a future update.</p>
      </div>
    </main>
  )
}
