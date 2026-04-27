import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/ui/BottomNav'

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .single()

  const isFree = !['trialing', 'active'].includes(userData?.subscription_status ?? 'free')

  return (
    <div className="flex flex-col min-h-screen">
      {isFree && (
        <a href="/upgrade" className="block w-full bg-primary/10 text-center text-primary text-xs font-label font-semibold py-2">
          ✦ Upgrade to Pro — unlock custom branding, team seats & more →
        </a>
      )}
      <div className="flex-1 pb-20">
        {children}
      </div>
      <BottomNav variant="manage" />
    </div>
  )
}
