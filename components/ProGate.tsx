'use client'

import { useState } from 'react'
import { createCheckoutSession } from '@/lib/actions/subscription'

interface Props {
  isPro: boolean
  feature: string
  featureDescription: string
  otherFeatures?: string[]
  children: React.ReactNode
}

export function ProGate({ isPro, feature, featureDescription, otherFeatures = [], children }: Props) {
  if (isPro) return <>{children}</>
  return <PaywallSheet feature={feature} featureDescription={featureDescription} otherFeatures={otherFeatures} />
}

function PaywallSheet({ feature, featureDescription, otherFeatures = [] }: Omit<Props, 'isPro' | 'children'>) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const result = await createCheckoutSession()
    if (result.url) {
      window.location.href = result.url
    } else {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
        <span className="text-3xl">🔒</span>
      </div>
      <div className="space-y-2">
        <h2 className="font-headline text-2xl font-bold text-on-surface">Pro feature</h2>
        <p className="text-on-surface-variant text-sm leading-relaxed">{featureDescription}</p>
      </div>
      {otherFeatures.length > 0 && (
        <ul className="text-left space-y-2 w-full max-w-xs">
          {otherFeatures.map(f => (
            <li key={f} className="flex items-center gap-2 text-on-surface-variant text-sm">
              <span className="text-tertiary">✓</span> {f}
            </li>
          ))}
        </ul>
      )}
      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full py-3 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-label font-semibold disabled:opacity-60"
        >
          {loading ? 'Redirecting…' : 'Upgrade to Pro — $19/mo'}
        </button>
        <p className="text-on-surface-variant text-xs">14-day free trial · Cancel anytime</p>
      </div>
    </div>
  )
}
