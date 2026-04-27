'use client'

import { useState } from 'react'
import { inviteTeamMember, removeTeamMember } from '@/lib/actions/team'

interface Member {
  id: string
  invited_phone: string
  role: string
  status: string
  member_user_id: string | null
}

export function TeamClient({ members }: { members: Member[] }) {
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'door_staff' | 'co_organizer'>('door_staff')
  const [error, setError] = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const result = await inviteTeamMember({ phone, role })
    if (result.error) { setError(result.error); return }
    setPhone('')
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="bg-surface-container-low rounded-xl p-4 space-y-3">
        <p className="text-on-surface-variant text-xs uppercase tracking-wider">Invite Member</p>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          type="tel"
          placeholder="+1 (555) 000-0000"
          className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as typeof role)}
          className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none"
        >
          <option value="door_staff">Door Staff</option>
          <option value="co_organizer">Co-Organizer</option>
        </select>
        {error && <p className="text-error text-xs">{error}</p>}
        <button type="submit" className="w-full py-2 rounded-full bg-primary text-on-primary font-label font-semibold text-sm">
          Send Invite
        </button>
      </form>

      <div className="space-y-2">
        {members.map(m => (
          <div key={m.id} className="bg-surface-container-low rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-on-surface text-sm font-semibold">{m.invited_phone}</p>
              <p className="text-on-surface-variant text-xs">{m.role.replace('_', ' ')} · {m.status}</p>
            </div>
            <form action={async () => { await removeTeamMember(m.id) }}>
              <button type="submit" className="text-error text-xs font-label">Remove</button>
            </form>
          </div>
        ))}
        {members.length === 0 && <p className="text-on-surface-variant text-sm text-center py-4">No team members yet.</p>}
      </div>
    </div>
  )
}
