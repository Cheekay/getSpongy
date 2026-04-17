import { describe, it, expect } from 'vitest'
import { hasRole, getPrimaryRole, getDefaultRoute, getRouteAccess } from '@/lib/auth'

describe('hasRole', () => {
  it('returns true when role flag is set', () => {
    expect(hasRole({ dj: true }, 'dj')).toBe(true)
  })
  it('returns false when role flag is not set', () => {
    expect(hasRole({ attendee: true }, 'dj')).toBe(false)
  })
  it('returns false for empty flags', () => {
    expect(hasRole({}, 'organizer')).toBe(false)
  })
})

describe('getPrimaryRole', () => {
  it('returns organizer when organizer flag is true (highest priority)', () => {
    expect(getPrimaryRole({ organizer: true, dj: true })).toBe('organizer')
  })
  it('returns dj when dj flag is true and organizer is false', () => {
    expect(getPrimaryRole({ dj: true, attendee: true })).toBe('dj')
  })
  it('defaults to attendee for empty flags', () => {
    expect(getPrimaryRole({})).toBe('attendee')
  })
})

describe('getDefaultRoute', () => {
  it('routes organizer to /events', () => {
    expect(getDefaultRoute({ organizer: true })).toBe('/events')
  })
  it('routes dj to /queue', () => {
    expect(getDefaultRoute({ dj: true })).toBe('/queue')
  })
  it('routes attendee to /explore', () => {
    expect(getDefaultRoute({})).toBe('/explore')
  })
})

describe('getRouteAccess', () => {
  it('allows deep link routes unauthenticated', () => {
    expect(getRouteAccess('/e/ABC123', {})).toBe('allow')
  })
  it('allows public auth routes', () => {
    expect(getRouteAccess('/login', {})).toBe('allow')
    expect(getRouteAccess('/verify', {})).toBe('allow')
  })
  it('allows studio routes for dj role', () => {
    expect(getRouteAccess('/queue', { dj: true })).toBe('allow')
    expect(getRouteAccess('/stats', { dj: true })).toBe('allow')
  })
  it('redirects non-dj from studio routes', () => {
    expect(getRouteAccess('/queue', {})).toBe('redirect-explore')
    expect(getRouteAccess('/queue', { attendee: true })).toBe('redirect-explore')
  })
  it('redirects organizer without dj role from studio routes', () => {
    expect(getRouteAccess('/queue', { organizer: true })).toBe('redirect-explore')
  })
  it('allows manage routes for organizer role', () => {
    expect(getRouteAccess('/events', { organizer: true })).toBe('allow')
    expect(getRouteAccess('/analytics', { organizer: true })).toBe('allow')
  })
  it('redirects non-organizer from manage routes', () => {
    expect(getRouteAccess('/events', {})).toBe('redirect-explore')
    expect(getRouteAccess('/analytics', { dj: true })).toBe('redirect-explore')
  })
  it('allows general attendee routes for any authenticated user', () => {
    expect(getRouteAccess('/explore', {})).toBe('allow')
    expect(getRouteAccess('/profile', { attendee: true })).toBe('allow')
  })
})
