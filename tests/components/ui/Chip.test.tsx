import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Chip } from '@/components/ui/Chip'

describe('Chip', () => {
  it('renders children', () => {
    render(<Chip variant="live">LIVE</Chip>)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('applies tertiary color for live variant', () => {
    render(<Chip variant="live">LIVE</Chip>)
    expect(screen.getByText('LIVE').className).toContain('text-tertiary')
  })

  it('applies tertiary color for fire variant', () => {
    render(<Chip variant="fire">FIRE</Chip>)
    expect(screen.getByText('FIRE').className).toContain('text-tertiary')
  })

  it('applies secondary color for played variant', () => {
    render(<Chip variant="played">PLAYED</Chip>)
    expect(screen.getByText('PLAYED').className).toContain('text-secondary')
  })

  it('applies error color for rejected variant', () => {
    render(<Chip variant="rejected">REJECTED</Chip>)
    expect(screen.getByText('REJECTED').className).toContain('text-error')
  })
})
