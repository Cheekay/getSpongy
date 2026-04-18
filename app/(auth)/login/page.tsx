'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRef, useEffect } from 'react'
import { sendOtp } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSearchParams, useRouter } from 'next/navigation'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Sending…' : 'Send Code'}
    </Button>
  )
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/explore'
  const router = useRouter()
  const phoneRef = useRef<HTMLInputElement>(null)

  const [state, action] = useActionState(sendOtp, {})

  useEffect(() => {
    if (!state.error && Object.keys(state).length > 0) {
      const phone = phoneRef.current?.value || ''
      router.push(
        `/verify?phone=${encodeURIComponent(phone)}&redirect=${encodeURIComponent(redirectTo)}`
      )
    }
  }, [state, redirectTo, router])

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline text-4xl font-bold">
            Welcome to <span className="text-primary">Spongy</span>
          </h1>
          <p className="text-on-surface-variant">Enter your number to get started</p>
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <div className="flex gap-2">
            <span className="flex items-center px-3 rounded-sm bg-surface-container-highest text-on-surface-variant text-sm">
              +1
            </span>
            <Input
              ref={phoneRef}
              name="phone"
              type="tel"
              placeholder="(555) 000-0000"
              autoComplete="tel"
              className="flex-1"
              required
            />
          </div>
          {state.error && (
            <p className="text-error text-sm">{state.error}</p>
          )}
          <SubmitButton />
        </form>

        <p className="text-on-surface-variant text-xs text-center">
          We'll send a one-time code via SMS.
        </p>
      </div>
    </main>
  )
}
