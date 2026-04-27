import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { acceptTeamInvite } from '@/lib/actions/team'

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/join-team/${token}`)

  const result = await acceptTeamInvite(token)

  if (result.error) {
    return (
      <main className="px-4 py-6 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold text-error">Invite Invalid</h1>
        <p className="text-on-surface-variant text-sm">{result.error}</p>
        <a href="/explore" className="text-secondary text-sm">Go home →</a>
      </main>
    )
  }

  redirect('/explore')
}
