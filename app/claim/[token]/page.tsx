import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { claimTransfer } from '@/lib/actions/transfers'
import { QRCodeSVG } from 'qrcode.react'

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/claim/${token}`)

  const result = await claimTransfer(token)

  if (result.error) {
    return (
      <main className="px-4 py-12 text-center space-y-4">
        <h1 className="font-headline text-2xl font-bold text-error">Transfer Invalid</h1>
        <p className="text-on-surface-variant text-sm">{result.error}</p>
        <a href="/explore" className="text-secondary text-sm">Explore events →</a>
      </main>
    )
  }

  return (
    <main className="px-4 py-12 flex flex-col items-center space-y-6">
      <h1 className="font-headline text-3xl font-bold">Ticket Claimed!</h1>
      <p className="text-on-surface-variant text-sm">Your ticket has been transferred to you.</p>
      <div className="bg-surface-container rounded-xl p-6 flex flex-col items-center space-y-3">
        <QRCodeSVG value={result.qrJwt!} size={180} bgColor="transparent" fgColor="#f8f5fd" />
        <p className="text-secondary text-sm">Show this at the door</p>
      </div>
    </main>
  )
}
