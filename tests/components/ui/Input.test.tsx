import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Input } from '@/components/ui/Input'

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Search tracks..." />)
    expect(screen.getByPlaceholderText('Search tracks...')).toBeInTheDocument()
  })

  it('calls onChange when value changes', () => {
    const handler = vi.fn()
    render(<Input onChange={handler} placeholder="Search" />)
    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'midnight' },
    })
    expect(handler).toHaveBeenCalled()
  })

  it('adds left padding when icon is provided', () => {
    render(<Input icon={<span data-testid="icon" />} placeholder="With icon" />)
    expect(screen.getByPlaceholderText('With icon').className).toContain('pl-12')
  })

  it('does not add left padding without icon', () => {
    render(<Input placeholder="No icon" />)
    expect(screen.getByPlaceholderText('No icon').className).not.toContain('pl-12')
  })
})
