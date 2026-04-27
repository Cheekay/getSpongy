import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'org-1' }
const mockSupabaseClient = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}))

const mockServiceClient = {
  from: vi.fn(),
}
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/pro', () => ({
  requirePro: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    SignJWT: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.setProtectedHeader = vi.fn().mockReturnThis()
      this.setExpirationTime = vi.fn().mockReturnThis()
      this.setIssuedAt = vi.fn().mockReturnThis()
      this.sign = vi.fn().mockResolvedValue('mock-invite-token')
    }),
    jwtVerify: vi.fn(),
  }
})

function makeQuery(result: unknown, extra: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    ...extra,
  }
  q.then = (r: (v: unknown) => void) => Promise.resolve(result).then(r)
  return q
}

import { inviteTeamMember, removeTeamMember, acceptTeamInvite } from '@/lib/actions/team'
import { requirePro } from '@/lib/pro'
import { jwtVerify } from 'jose'

describe('inviteTeamMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    vi.mocked(requirePro).mockResolvedValue(undefined)
  })

  it('returns error when not authenticated', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const result = await inviteTeamMember({ phone: '+15551234567', role: 'door_staff' })
    expect(result.error).toBe('Not authenticated')
  })

  it('creates team member and returns invite token', async () => {
    const insertQuery = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'tm-1' }, error: null }) }
    mockServiceClient.from.mockReturnValue(insertQuery)

    const result = await inviteTeamMember({ phone: '+15551234567', role: 'door_staff' })
    expect(result.error).toBeUndefined()
    expect(result.inviteToken).toBe('mock-invite-token')
  })
})

describe('removeTeamMember', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } })
    vi.mocked(requirePro).mockResolvedValue(undefined)
  })

  it('deletes the team member row', async () => {
    const deleteQuery = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    ;(deleteQuery as any).then = (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r)
    mockServiceClient.from.mockReturnValue(deleteQuery)

    const result = await removeTeamMember('tm-1')
    expect(result.error).toBeUndefined()
    expect(deleteQuery.delete).toHaveBeenCalled()
  })
})

describe('acceptTeamInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'member-1' } } })
  })

  it('returns error for invalid token', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid token'))
    const result = await acceptTeamInvite('bad-token')
    expect(result.error).toMatch(/invalid/i)
  })

  it('updates team member row on valid token', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { teamMemberId: 'tm-1', organizerId: 'org-1' } } as any)
    const updateQuery = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }
    mockServiceClient.from.mockReturnValue(updateQuery)

    const result = await acceptTeamInvite('valid-token')
    expect(result.error).toBeUndefined()
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      member_user_id: 'member-1',
      status: 'accepted',
    }))
  })
})
