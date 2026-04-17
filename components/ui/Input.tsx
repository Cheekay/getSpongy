import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-sm bg-surface-container-highest px-4 py-3',
            'font-body text-on-surface placeholder:text-on-surface-variant',
            'border border-outline-variant/10',
            'focus:outline-none focus:border-secondary',
            'focus:shadow-[0_0_0_4px_rgba(0,244,254,0.1)]',
            'transition-all duration-200',
            icon && 'pl-12',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = 'Input'
