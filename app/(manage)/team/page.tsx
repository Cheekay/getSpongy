import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isProUser } from '@/lib/pro'
import { ProGate } from '@/components/ProGate'
import { TeamClient } from './TeamClient'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [isPro, { data: members }] = await Promise.all([
    isProUser(user.id),
    supabase.from('team_members').select('id, invited_phone, role, status, member_user_id').eq('organizer_id', user.id),
  ])

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Your Team</h1>
      <ProGate
        isPro={isPro}
        feature="Team Seats"
        featureDescription="Invite door staff and co-organizers to help run your events."
        otherFeatures={['Custom branding', 'Multi-event analytics', 'DJ payouts']}
      >
        <TeamClient members={members ?? []} />
      </ProGate>
    </main>
  )
}
