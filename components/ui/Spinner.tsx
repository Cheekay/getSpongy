// components/ui/Spinner.tsx
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-outline-variant border-t-secondary animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
