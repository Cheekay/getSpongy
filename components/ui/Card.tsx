import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

type CardVariant = 'default' | 'glowing'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
}

export function Card({ variant = 'default', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-container rounded-xl p-4 ring-1 ring-outline-variant/15',
        variant === 'default' && 'hover:bg-surface-container-high transition-colors',
        variant === 'glowing' && 'ambient-glow-secondary hover:ring-outline-variant/30 transition-all',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
