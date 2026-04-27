import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isProUser } from '@/lib/pro'
import { ProGate } from '@/components/ProGate'
import { saveBrandSettingsFromForm } from '@/lib/actions/branding'

export default async function BrandPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [isPro, { data: userData }] = await Promise.all([
    isProUser(user.id),
    supabase.from('users').select('brand_logo_url, brand_accent_color, brand_hide_watermark').eq('id', user.id).single(),
  ])

  return (
    <main className="px-4 py-6 space-y-6">
      <h1 className="font-headline text-2xl font-bold">Brand Settings</h1>
      <ProGate
        isPro={isPro}
        feature="Custom Branding"
        featureDescription="Add your own logo and colors to event pages and recap graphics. Remove the Spongy watermark."
        otherFeatures={['Multi-event analytics', 'Team seats', 'DJ payouts']}
      >
        <form action={saveBrandSettingsFromForm} className="space-y-6">
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-on-surface-variant text-xs uppercase tracking-wider">Logo URL</p>
            <input
              name="logoUrl"
              type="url"
              defaultValue={userData?.brand_logo_url ?? ''}
              placeholder="https://example.com/logo.png"
              className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
            <p className="text-on-surface-variant text-xs uppercase tracking-wider">Accent Color</p>
            <input
              name="accentColor"
              type="text"
              defaultValue={userData?.brand_accent_color ?? ''}
              placeholder="#BC13FE"
              className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <div className="bg-surface-container-low rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-on-surface text-sm">Hide Spongy watermark</p>
              <p className="text-on-surface-variant text-xs">Remove "Made with Spongy" from recap graphics</p>
            </div>
            <input type="checkbox" name="hideWatermark" defaultChecked={userData?.brand_hide_watermark ?? false} className="accent-primary" />
          </div>
          <button type="submit" className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold">
            Save
          </button>
        </form>
      </ProGate>
    </main>
  )
}
