import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-label font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
          variant === 'primary' && [
            'rounded-full px-8 py-3',
            'bg-gradient-to-r from-primary to-primary-container',
            'text-on-primary-fixed',
            'btn-pulse',
          ],
          variant === 'secondary' && [
            'rounded-full px-8 py-3',
            'bg-transparent ring-1 ring-outline-variant/20',
            'text-on-surface-variant',
            'hover:bg-surface-bright',
          ],
          variant === 'tertiary' && [
            'px-4 py-2',
            'text-secondary',
            'underline-offset-2 hover:underline',
          ],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
