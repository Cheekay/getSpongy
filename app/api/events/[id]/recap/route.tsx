import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const admin = createServiceClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, start_at, state')
    .eq('id', id)
    .single()

  if (!event) return new NextResponse('Event not found', { status: 404 })
  if (event.state !== 'ended') return new NextResponse('Not available yet', { status: 404 })

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
        {/* Header */}
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

        {/* Stats */}
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

        {/* Top 3 tracks */}
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

        {/* Footer */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#de8eff', fontSize: '16px', fontWeight: 700 }}>spongy.app</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Content-Disposition': 'attachment; filename="spongy-recap.png"',
        'Cache-Control': 'public, max-age=86400',
      },
    }
  )
}
