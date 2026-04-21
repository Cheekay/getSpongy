import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'

export default function ProfilePage() {
  return (
    <main className="px-4 py-6 space-y-8">
      <div>
        <h1 className="font-headline text-4xl font-bold">Pulse Profile</h1>
        <p className="text-on-surface-variant mt-2">User profile & stats — Phase 2</p>
      </div>

      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full text-error border-error/30">
          Sign out
        </Button>
      </form>
    </main>
  )
}
