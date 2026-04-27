'use client'

import { useEffect } from 'react'

export function NativeTokenSync() {
  useEffect(() => {
    function handleToken(e: Event) {
      const { token, platform } = (e as CustomEvent<{ token: string; platform: string }>).detail
      if (!token || !platform) return

      fetch('/api/notifications/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform }),
      }).catch(() => {})
    }

    window.addEventListener('nativePushToken', handleToken)
    return () => window.removeEventListener('nativePushToken', handleToken)
  }, [])

  return null
}
