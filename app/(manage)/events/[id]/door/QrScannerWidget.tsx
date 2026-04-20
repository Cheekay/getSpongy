'use client'

import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const READER_ID = 'qr-door-reader'

export function QrScannerWidget({ onScan }: { onScan: (text: string) => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => onScanRef.current(decoded),
        undefined
      )
      .catch(() => {
        // Camera permission denied — user will see empty widget
      })

    return () => {
      scanner.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div
        id={READER_ID}
        className="w-full max-w-[300px] rounded-xl overflow-hidden bg-surface-container-high"
      />
      <p className="text-on-surface-variant text-sm text-center">
        Point camera at attendee's QR code
      </p>
    </div>
  )
}
