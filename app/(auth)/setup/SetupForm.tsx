'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveName } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Saving…' : 'Continue'}
    </Button>
  )
}

export default function SetupForm({ redirectTo }: { redirectTo: string }) {
  const [state, action] = useActionState(saveName, {})

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Input
        name="name"
        type="text"
        placeholder="Your first name"
        autoComplete="given-name"
        autoFocus
        required
      />
      {state.error && <p className="text-error text-sm">{state.error}</p>}
      <SubmitButton />
    </form>
  )
}
