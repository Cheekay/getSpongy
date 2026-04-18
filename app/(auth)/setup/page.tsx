import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SetupForm from './SetupForm'

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect: redirectTo = '/explore' } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/setup?redirect=${encodeURIComponent(redirectTo)}`)

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single()

  if (profile?.name) redirect(redirectTo)

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="font-headline text-3xl font-bold">One last thing</h1>
          <p className="text-on-surface-variant">What should we call you?</p>
        </div>
        <SetupForm redirectTo={redirectTo} />
      </div>
    </main>
  )
}
