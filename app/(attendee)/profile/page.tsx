import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'

export default function ProfilePage() {
  return (
    <main className="px-4 py-6 pb-24 space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold">Profile</h1>
        <p className="text-on-surface-variant mt-1 text-sm">Account settings — coming soon.</p>
      </div>

      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full text-error border-error/30">
          Sign out
        </Button>
      </form>
    </main>
  )
}
