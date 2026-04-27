import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { approveRefund, denyRefund } from '@/lib/actions/refunds'
import { Chip } from '@/components/ui/Chip'

export default async function RefundsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: event } = await supabase
    .from('events')
    .select('id, title, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) notFound()

  const { data: requests } = await supabase
    .from('refund_requests')
    .select('id, reason, note, status, requested_at, rsvp:rsvps(id, user_id, users(name, phone))')
    .eq('rsvp.event_id', id)
    .order('requested_at', { ascending: false })

  const pending = requests?.filter(r => r.status === 'pending') ?? []
  const resolved = requests?.filter(r => r.status !== 'pending') ?? []

  return (
    <main className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/manage/events/${id}`} className="text-on-surface-variant">←</a>
        <h1 className="font-headline text-2xl font-bold flex-1">Refund Requests</h1>
      </div>

      {pending.length === 0 && (
        <p className="text-on-surface-variant text-sm text-center py-8">No pending refund requests.</p>
      )}

      {pending.map(req => (
        <div key={req.id} className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-label font-semibold text-on-surface">{(req.rsvp as any)?.users?.name ?? 'Unknown'}</p>
            <Chip variant="pending">PENDING</Chip>
          </div>
          <p className="text-on-surface-variant text-sm">{req.reason}</p>
          {req.note && <p className="text-on-surface-variant text-xs italic">{req.note}</p>}
          <p className="text-on-surface-variant text-xs">{new Date(req.requested_at).toLocaleDateString()}</p>
          <div className="flex gap-3">
            <form action={async () => { await approveRefund(req.id) }} className="flex-1">
              <button type="submit" className="w-full py-2 rounded-full bg-primary text-on-primary font-label font-semibold text-sm">
                Approve Refund
              </button>
            </form>
            <form action={async () => { await denyRefund(req.id) }} className="flex-1">
              <button type="submit" className="w-full py-2 rounded-full border border-outline/30 text-on-surface font-label font-semibold text-sm">
                Deny
              </button>
            </form>
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-on-surface-variant text-xs uppercase tracking-wider">Resolved</p>
          {resolved.map(req => (
            <div key={req.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-on-surface text-sm">{(req.rsvp as any)?.users?.name ?? 'Unknown'}</p>
              <Chip variant={req.status === 'approved' ? 'live' : 'played'}>
                {req.status.toUpperCase()}
              </Chip>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
