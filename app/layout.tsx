import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Be_Vietnam_Pro } from 'next/font/google'
import '../styles/globals.css'
import { NativeTokenSync } from '@/components/NativeTokenSync'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-headline',
  display: 'swap',
})

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Spongy',
  description: 'The event platform where the crowd controls the vibe.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0e0e13',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Material Symbols for icons used in BottomNav and UI components */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${spaceGrotesk.variable} ${beVietnamPro.variable} bg-background text-on-surface font-body antialiased overflow-x-hidden selection:bg-primary selection:text-on-primary-fixed`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:bg-primary focus:text-on-primary focus:font-label focus:font-semibold focus:text-sm"
        >
          Skip to main content
        </a>
        <NativeTokenSync />
        {children}
      </body>
    </html>
  )
}
