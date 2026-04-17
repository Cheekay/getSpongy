import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomNav } from '@/components/ui/BottomNav'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
}))

describe('BottomNav — attendee variant', () => {
  it('renders all four attendee nav items', () => {
    render(<BottomNav variant="attendee" />)
    expect(screen.getByText('Explore')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Requests')).toBeInTheDocument()
    expect(screen.getByText('My Pulse')).toBeInTheDocument()
  })
})

describe('BottomNav — studio variant', () => {
  it('renders studio-specific items', () => {
    render(<BottomNav variant="studio" />)
    expect(screen.getByText('Studio')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })
  it('does not render attendee-only items', () => {
    render(<BottomNav variant="studio" />)
    expect(screen.queryByText('My Pulse')).not.toBeInTheDocument()
    expect(screen.queryByText('Requests')).not.toBeInTheDocument()
  })
})

describe('BottomNav — manage variant', () => {
  it('renders organizer-specific items', () => {
    render(<BottomNav variant="manage" />)
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })
})
