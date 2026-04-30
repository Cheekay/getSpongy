'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Image from 'next/image'

async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file)
      }, 'image/jpeg', quality)
    }
    img.src = URL.createObjectURL(file)
  })
}

export default function NewEventPage() {
  const router = useRouter()
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const compressedFileRef = useRef<File | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    compressImage(file).then((compressed) => { compressedFileRef.current = compressed })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const form = e.currentTarget
    const formData = new FormData(form)
    const publish = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action') === 'publish'
    formData.set('publish', String(publish))
    if (compressedFileRef.current) {
      formData.set('coverImage', compressedFileRef.current)
    }

    try {
      const res = await fetch('/api/events', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Something went wrong'); return }
      router.push(`/events/${json.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="px-4 py-6 pb-32">
      <div className="flex items-center justify-between mb-6">
        <a href="/events" className="text-on-surface-variant">← Back</a>
        <h1 className="font-headline text-xl font-bold">Create Event</h1>
        <div className="w-16" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Cover image */}
        <div
          className="w-full aspect-video rounded-xl bg-surface-container-low flex flex-col items-center justify-center cursor-pointer overflow-hidden relative"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <Image src={preview} alt="Cover preview" fill className="object-cover" />
          ) : (
            <div className="text-center space-y-2 pointer-events-none">
              <div className="text-4xl">📷</div>
              <p className="text-on-surface-variant text-sm">Add cover photo</p>
              <p className="text-on-surface-variant text-xs">(required to publish)</p>
            </div>
          )}
          <input
            ref={fileRef}
            name="coverImage"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <Input name="title" type="text" placeholder="Event name" required />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-on-surface-variant text-xs uppercase tracking-wider">Start</label>
            <Input name="startAt" type="datetime-local" required />
          </div>
          <div className="space-y-1">
            <label className="text-on-surface-variant text-xs uppercase tracking-wider">End</label>
            <Input name="endAt" type="datetime-local" required />
          </div>
        </div>

        <Input name="venueName" type="text" placeholder="Venue name" required />

        <textarea
          name="description"
          rows={4}
          placeholder="Tell people what to expect…"
          className="w-full rounded-sm bg-surface-container-highest px-4 py-3 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-secondary resize-none"
        />

        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs uppercase tracking-wider">Ticket Type</label>
          <div className="flex gap-2">
            <span className="px-4 py-1.5 rounded-full bg-tertiary-container text-on-tertiary-container text-sm font-label">
              Free RSVP
            </span>
            <span className="px-4 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-sm font-label opacity-40">
              Paid (Phase 3)
            </span>
          </div>
          <input type="hidden" name="rsvpType" value="free" />
        </div>

        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs uppercase tracking-wider">Capacity</label>
          <Input name="capacity" type="number" min="1" placeholder="Unlimited" />
        </div>

        <div className="space-y-2">
          <label className="text-on-surface-variant text-xs uppercase tracking-wider">Privacy</label>
          <div className="flex rounded-full bg-surface-container overflow-hidden">
            {['public', 'unlisted'].map(val => (
              <label key={val} className="flex-1 text-center cursor-pointer">
                <input type="radio" name="privacy" value={val} defaultChecked={val === 'public'} className="sr-only peer" />
                <span className="block py-2 text-sm text-on-surface-variant peer-checked:bg-surface-bright peer-checked:text-on-surface capitalize transition-colors">
                  {val === 'unlisted' ? 'Link only' : 'Public'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-container-lowest space-y-2">
          <Button
            type="submit"
            data-action="publish"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? 'Publishing…' : 'Publish Event'}
          </Button>
          <Button
            type="submit"
            data-action="draft"
            variant="secondary"
            disabled={submitting}
            className="w-full"
          >
            Save Draft
          </Button>
        </div>
      </form>
    </main>
  )
}
