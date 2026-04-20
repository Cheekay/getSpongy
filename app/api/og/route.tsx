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
    .select('title, venue_name, start_at, timezone, cover_image_url')
    .eq('id', eventId)
    .single()

  if (!event) return new Response('Event not found', { status: 404 })

  const dateStr = new Date(event.start_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0e0e13',
          position: 'relative',
        }}
      >
        {event.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.cover_image_url}
            alt=""
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '55%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to right, #0e0e13 45%, transparent 75%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: '50%',
            padding: '48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <span style={{ color: '#de8eff', fontSize: '20px', fontWeight: 700 }}>Spongy</span>
          <span
            style={{
              color: '#f8f5fd',
              fontSize: event.title.length > 30 ? '36px' : '48px',
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            {event.title}
          </span>
          <span style={{ color: '#acaab1', fontSize: '20px' }}>{dateStr}</span>
          {event.venue_name && (
            <span style={{ color: '#acaab1', fontSize: '18px' }}>📍 {event.venue_name}</span>
          )}
          <span
            style={{
              marginTop: '8px',
              background: '#bcff5f',
              color: '#3d6100',
              borderRadius: '9999px',
              padding: '6px 20px',
              fontSize: '14px',
              fontWeight: 700,
              width: 'fit-content',
            }}
          >
            FREE ENTRY
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control':
          'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
