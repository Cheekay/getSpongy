import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code') ?? ''

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .select('id, event_code, state, privacy')
    .eq('event_code', code)
    .single()

  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...',
    code,
    data,
    error: error?.message ?? null,
  })
}
