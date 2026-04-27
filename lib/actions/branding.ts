'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePro } from '@/lib/pro'

interface BrandPatch {
  logoUrl?: string
  accentColor?: string
  hideWatermark: boolean
}

export async function saveBrandSettingsFromForm(formData: FormData): Promise<void> {
  await saveBrandSettings({
    logoUrl: formData.get('logoUrl') as string | undefined ?? undefined,
    accentColor: formData.get('accentColor') as string | undefined ?? undefined,
    hideWatermark: formData.get('hideWatermark') === 'on',
  })
}

export async function saveBrandSettings(patch: BrandPatch): Promise<{ error?: string }> {
  await requirePro()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()
  const { error } = await admin.from('users').update({
    brand_logo_url: patch.logoUrl,
    brand_accent_color: patch.accentColor,
    brand_hide_watermark: patch.hideWatermark,
  }).eq('id', user.id)

  if (error) return { error: error.message }
  return {}
}
