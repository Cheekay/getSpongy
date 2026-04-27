import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'org-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = { from: vi.fn() }
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/pro', () => ({
  isProUser: vi.fn(),
  requirePro: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { saveBrandSettings } from '@/lib/actions/branding'
import { requirePro } from '@/lib/pro'

describe('saveBrandSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    vi.mocked(requirePro).mockResolvedValue(undefined)
  })

  it('redirects to /upgrade when not pro', async () => {
    vi.mocked(requirePro).mockRejectedValue(new Error('REDIRECT:/upgrade'))
    await expect(saveBrandSettings({ hideWatermark: true })).rejects.toThrow('REDIRECT:/upgrade')
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await saveBrandSettings({ hideWatermark: false })
    expect(result.error).toBe('Not authenticated')
  })

  it('saves brand settings for pro user', async () => {
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await saveBrandSettings({
      logoUrl: 'https://example.com/logo.png',
      accentColor: '#ff00ff',
      hideWatermark: true,
    })
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith({
      brand_logo_url: 'https://example.com/logo.png',
      brand_accent_color: '#ff00ff',
      brand_hide_watermark: true,
    })
  })

  it('accepts partial update (only hideWatermark)', async () => {
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await saveBrandSettings({ hideWatermark: false })
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith({
      brand_logo_url: undefined,
      brand_accent_color: undefined,
      brand_hide_watermark: false,
    })
  })
})
