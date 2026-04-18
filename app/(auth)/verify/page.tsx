'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { verifyOtp } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Verifying…' : 'Verify'}
    </Button>
  )
}

export default function VerifyPage() {
  const searchParams = useSearchParams()
  const phone = searchParams.get('phone') || ''
  const redirectTo = searchParams.get('redirect') || '/explore'

  const [state, action] = useActionState(verifyOtp, {})

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-bold">Check your texts</h1>
          <p className="text-on-surface-variant">
            We sent a code to{' '}
            <span className="text-primary">{phone || 'your phone'}</span>
          </p>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <input
            name="token"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            autoComplete="one-time-code"
            className="w-full text-center text-2xl tracking-widest rounded-sm bg-surface-container-highest px-4 py-3 text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
            required
          />
          {state.error && (
            <p className="text-error text-sm">{state.error}</p>
          )}
          <SubmitButton />
        </form>

        <div className="text-center space-y-1">
          <p className="text-on-surface-variant text-sm">
            Didn't get it?{' '}
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="text-secondary"
            >
              Resend code
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
