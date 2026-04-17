import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from '@/components/ui/Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies surface-container background by default', () => {
    const { container } = render(<Card>Content</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('bg-surface-container')
  })

  it('applies ambient-glow-secondary for glowing variant', () => {
    const { container } = render(<Card variant="glowing">Content</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('ambient-glow-secondary')
  })

  it('passes through additional className', () => {
    const { container } = render(<Card className="extra-class">Content</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('extra-class')
  })
})
