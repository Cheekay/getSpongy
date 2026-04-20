import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function escapeCSV(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: event } = await supabase
    .from('events')
    .select('id, organizer_id')
    .eq('id', id)
    .eq('organizer_id', user.id)
    .single()

  if (!event) return new NextResponse('Not found', { status: 404 })

  const admin = createServiceClient()
  const { data: requests, error } = await admin
    .from('song_requests')
    .select('track_title, track_artist, state, upvote_count, tip_cents, created_at')
    .eq('event_id', id)
    .order('created_at', { ascending: true })

  if (error) return new NextResponse('Failed to fetch requests', { status: 500 })

  const header = 'track_title,track_artist,state,upvotes,tip_cents,requested_at\n'
  const rows = (requests ?? []).map((r) =>
    [
      escapeCSV(r.track_title),
      escapeCSV(r.track_artist),
      escapeCSV(r.state),
      escapeCSV(r.upvote_count),
      escapeCSV(r.tip_cents),
      escapeCSV(r.created_at),
    ].join(',')
  )

  const csv = header + rows.join('\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${id}-requests.csv"`,
    },
  })
}
