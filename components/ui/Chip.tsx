import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

type ChipVariant = 'live' | 'selling-fast' | 'fire' | 'played' | 'pending' | 'rejected'

interface ChipProps {
  variant: ChipVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<ChipVariant, string> = {
  'live':         'bg-tertiary/10 text-tertiary border border-tertiary/20',
  'selling-fast': 'bg-tertiary/10 text-tertiary border border-tertiary/20',
  'fire':         'bg-tertiary/10 text-tertiary border border-tertiary/20',
  'played':       'bg-secondary/10 text-secondary border border-secondary/20',
  'pending':      'bg-surface-container-high text-on-surface-variant',
  'rejected':     'bg-error/10 text-error border border-error/20',
}

export function Chip({ variant, children, className }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
        'font-label text-xs font-semibold uppercase tracking-wider',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
