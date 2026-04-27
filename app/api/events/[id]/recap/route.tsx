import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = createServiceClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, start_at, state, organizer_id')
    .eq('id', id)
    .single()

  if (!event || event.organizer_id !== user.id) return new NextResponse('Not found', { status: 404 })
  if (event.state !== 'ended') return new NextResponse('Not available yet', { status: 404 })

  const { data: organizer } = await admin
    .from('users')
    .select('brand_logo_url, brand_hide_watermark')
    .eq('id', event.organizer_id)
    .single()

  const [attendanceResult, topTracksResult] = await Promise.all([
    admin
      .from('rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'checked_in'),
    admin
      .from('song_requests')
      .select('track_title, track_artist, album_art_url, upvote_count')
      .eq('event_id', id)
      .eq('state', 'played')
      .order('upvote_count', { ascending: false })
      .limit(3),
  ])

  const attendance = attendanceResult.count ?? 0
  const topTracks = topTracksResult.data ?? []

  const dateStr = new Date(event.start_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0e0e13',
          padding: '48px',
          gap: '24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ color: '#de8eff', fontSize: '18px', fontWeight: 700 }}>Spongy Recap</span>
          <span
            style={{
              color: '#f8f5fd',
              fontSize: event.title.length > 25 ? '42px' : '56px',
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            {event.title}
          </span>
          <span style={{ color: '#acaab1', fontSize: '20px' }}>{dateStr}</span>
        </div>

        <div style={{ display: 'flex', gap: '24px' }}>
          <div
            style={{
              background: '#bcff5f',
              borderRadius: '16px',
              padding: '16px 24px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span style={{ color: '#3d6100', fontSize: '36px', fontWeight: 800 }}>{attendance}</span>
            <span style={{ color: '#3d6100', fontSize: '14px', fontWeight: 600 }}>attended</span>
          </div>
        </div>

        {topTracks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ color: '#acaab1', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Top Played
            </span>
            {topTracks.map((track, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {track.album_art_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.album_art_url}
                    alt=""
                    style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover' }}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#f8f5fd', fontSize: '16px', fontWeight: 600 }}>{track.track_title}</span>
                  <span style={{ color: '#acaab1', fontSize: '14px' }}>{track.track_artist}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#de8eff', fontSize: '16px', fontWeight: 700 }}>spongy.app</span>
          {!(organizer?.brand_hide_watermark) && (
            <span style={{ marginLeft: '8px', color: '#acaab1', fontSize: '12px' }}>Made with Spongy</span>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Content-Disposition': 'attachment; filename="spongy-recap.png"',
        'Cache-Control': 'private, max-age=86400',
      },
    }
  )
}
