import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')
  if (!eventId) return new Response('Missing eventId', { status: 400 })

  const admin = createServiceClient()
  const { data: event } = await admin
    .from('events')
    .select('title, venue_name, start_at, timezone, cover_image_url, event_code')
    .eq('id', eventId)
    .single()

  if (!event) return new Response('Event not found', { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://spongy.app'
  const dateStr = new Date(event.start_at).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = new Date(event.start_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const slug = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex' }}>
        {event.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: '#0e0e13' }} />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to bottom, rgba(14,14,19,0.2) 0%, rgba(14,14,19,0.85) 40%, #0e0e13 100%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '80px 60px',
            width: '100%',
            height: '100%',
          }}
        >
          <span style={{ color: '#de8eff', fontSize: '36px', fontWeight: 800 }}>Spongy</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <span
              style={{
                color: '#f8f5fd',
                fontSize: event.title.length > 20 ? '72px' : '96px',
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {event.title}
            </span>
            <span style={{ color: '#acaab1', fontSize: '40px' }}>{dateStr}</span>
            <span style={{ color: '#acaab1', fontSize: '36px' }}>{timeStr}</span>
            {event.venue_name && (
              <span style={{ color: '#acaab1', fontSize: '32px' }}>📍 {event.venue_name}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span style={{ color: '#bcff5f', fontSize: '32px', fontWeight: 700 }}>
              RSVP free → {appUrl}/e/{event.event_code}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: {
        'Content-Disposition': `attachment; filename="${slug}-story.png"`,
        'Cache-Control': 'public, max-age=3600',
      },
    }
  )
}
