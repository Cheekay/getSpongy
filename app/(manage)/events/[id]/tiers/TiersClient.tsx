'use client'

import { useState } from 'react'
import { createTier, updateTier, deleteTier } from '@/lib/actions/tiers'

type Tier = {
  id: string
  name: string
  price_cents: number
  inventory: number | null
  sold_count: number
  active: boolean
}

export default function TiersClient({
  eventId,
  initialTiers,
  isLive,
}: {
  eventId: string
  initialTiers: Tier[]
  isLive: boolean
}) {
  const [tiers, setTiers] = useState<Tier[]>(initialTiers)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newInventory, setNewInventory] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    const priceCents = Math.round(parseFloat(newPrice) * 100)
    const inventory = newInventory ? parseInt(newInventory, 10) : null
    if (!newName.trim() || isNaN(priceCents) || priceCents < 50) {
      setError('Name and price (min $0.50) are required')
      return
    }
    const result = await createTier(eventId, { name: newName.trim(), priceCents, inventory })
    if (result.error) { setError(result.error); return }
    setTiers([...tiers, { id: result.tierId!, name: newName, price_cents: priceCents, inventory, sold_count: 0, active: true }])
    setNewName(''); setNewPrice(''); setNewInventory(''); setCreating(false)
  }

  async function handleDelete(tierId: string) {
    const result = await deleteTier(tierId)
    if (result.error) { setError(result.error); return }
    setTiers(tiers.filter(t => t.id !== tierId))
  }

  async function handleToggleActive(tier: Tier) {
    const result = await updateTier(tier.id, { active: !tier.active })
    if (result.error) { setError(result.error); return }
    setTiers(tiers.map(t => t.id === tier.id ? { ...t, active: !t.active } : t))
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-error text-sm">{error}</p>}

      {tiers.length === 0 && !creating && (
        <p className="text-on-surface-variant text-sm text-center py-8">No tiers yet.</p>
      )}

      {tiers.map((tier) => (
        <div key={tier.id} className="bg-surface-container-low rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-label font-semibold text-on-surface">{tier.name}</p>
              <p className="text-on-surface-variant text-sm">
                ${(tier.price_cents / 100).toFixed(2)}
                {tier.inventory !== null && ` · ${tier.sold_count}/${tier.inventory} sold`}
              </p>
            </div>
            {!isLive && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleToggleActive(tier)}
                  className="text-on-surface-variant text-xs font-label"
                >
                  {tier.active ? 'Disable' : 'Enable'}
                </button>
                {tier.sold_count === 0 && (
                  <button
                    onClick={() => handleDelete(tier.id)}
                    className="text-error text-xs font-label"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {!isLive && !creating && (
        <button
          onClick={() => setCreating(true)}
          className="w-full py-3 rounded-xl border border-dashed border-outline-variant text-on-surface-variant text-sm font-label"
        >
          + Add Tier
        </button>
      )}

      {creating && (
        <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
          <input
            placeholder="Tier name (e.g. General Admission)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Price ($)"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              min="0.50"
              step="0.01"
              className="flex-1 bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
            <input
              type="number"
              placeholder="Inventory (optional)"
              value={newInventory}
              onChange={(e) => setNewInventory(e.target.value)}
              min="1"
              className="flex-1 bg-surface-container-highest rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setCreating(false); setError(null) }}
              className="flex-1 py-2 rounded-lg text-on-surface-variant text-sm font-label"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="flex-1 py-2 rounded-lg bg-primary text-on-primary text-sm font-label font-semibold"
            >
              Add Tier
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
