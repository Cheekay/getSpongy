import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

function generateEventCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function getUniqueEventCode(admin: ReturnType<typeof createServiceClient>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateEventCode()
    const { data } = await admin.from('events').select('id').eq('event_code', code).single()
    if (!data) return code
  }
  throw new Error('Failed to generate unique event code after 10 attempts')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const title = (formData.get('title') as string)?.trim()
  const startAt = formData.get('startAt') as string
  const endAt = formData.get('endAt') as string
  const timezone = (formData.get('timezone') as string) || 'America/New_York'
  const venueName = (formData.get('venueName') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const capacity = formData.get('capacity') ? Number(formData.get('capacity')) : null
  const privacy = (formData.get('privacy') as string) || 'public'
  const publish = formData.get('publish') === 'true'
  const coverImage = formData.get('coverImage') as File | null

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 422 })
  if (!startAt || !endAt) return NextResponse.json({ error: 'Start and end times are required' }, { status: 422 })
  if (!venueName) return NextResponse.json({ error: 'Venue is required' }, { status: 422 })
  if (publish && !coverImage) return NextResponse.json({ error: 'Cover image is required to publish' }, { status: 422 })

  const admin = createServiceClient()

  let coverImageUrl: string | null = null
  if (coverImage && coverImage.size > 0) {
    const ext = coverImage.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('event-covers')
      .upload(path, coverImage, { contentType: coverImage.type, upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: { publicUrl } } = admin.storage.from('event-covers').getPublicUrl(path)
    coverImageUrl = publicUrl
  }

  const eventCode = await getUniqueEventCode(admin)

  const { data: event, error } = await admin.from('events').insert({
    organizer_id: user.id,
    title,
    start_at: startAt,
    end_at: endAt,
    timezone,
    venue_name: venueName,
    description,
    capacity,
    privacy,
    cover_image_url: coverImageUrl,
    event_code: eventCode,
    state: publish ? 'published' : 'draft',
    rsvp_type: 'free',
  }).select('id, event_code').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: event.id, event_code: event.event_code }, { status: 201 })
}
