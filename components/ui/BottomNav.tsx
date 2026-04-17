'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type BottomNavVariant = 'attendee' | 'studio' | 'manage'

type NavItem = { href: string; icon: string; label: string }

const navItems: Record<BottomNavVariant, NavItem[]> = {
  attendee: [
    { href: '/explore',  icon: 'explore',      label: 'Explore'   },
    { href: '/live',     icon: 'equalizer',    label: 'Live'      },
    { href: '/requests', icon: 'queue_music',  label: 'Requests'  },
    { href: '/profile',  icon: 'person',       label: 'My Pulse'  },
  ],
  studio: [
    { href: '/explore',  icon: 'explore',      label: 'Explore'   },
    { href: '/live',     icon: 'equalizer',    label: 'Live'      },
    { href: '/queue',    icon: 'queue_music',  label: 'Studio'    },
    { href: '/stats',    icon: 'bar_chart',    label: 'Stats'     },
  ],
  manage: [
    { href: '/events',    icon: 'event',       label: 'Events'    },
    { href: '/analytics', icon: 'analytics',   label: 'Analytics' },
  ],
}

interface BottomNavProps {
  variant: BottomNavVariant
}

export function BottomNav({ variant }: BottomNavProps) {
  const pathname = usePathname()
  const items = navItems[variant]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-low/80 backdrop-blur-xl border-t border-outline-variant/10">
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors',
                isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
              <span className="font-label text-[10px] font-semibold uppercase tracking-wider">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
