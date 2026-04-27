import { describe, it, expect, vi } from 'vitest'

const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

function makeQuery(result: unknown) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
  }
  return q
}

import { isProUser, requirePro } from '@/lib/pro'

describe('isProUser', () => {
  it('returns true for active subscription', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'active' } })
    )
    expect(await isProUser('user-1')).toBe(true)
  })

  it('returns true for trialing subscription', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'trialing' } })
    )
    expect(await isProUser('user-1')).toBe(true)
  })

  it('returns false for free', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'free' } })
    )
    expect(await isProUser('user-1')).toBe(false)
  })

  it('returns false for past_due', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'past_due' } })
    )
    expect(await isProUser('user-1')).toBe(false)
  })

  it('returns false for canceled', async () => {
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'canceled' } })
    )
    expect(await isProUser('user-1')).toBe(false)
  })
})

describe('requirePro', () => {
  it('throws redirect to /upgrade for free user', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'free' } })
    )
    await expect(requirePro()).rejects.toThrow('REDIRECT:/upgrade')
  })

  it('does not throw for active user', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSupabaseClient.from.mockReturnValue(
      makeQuery({ data: { subscription_status: 'active' } })
    )
    await expect(requirePro()).resolves.toBeUndefined()
  })
})
