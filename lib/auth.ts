export type UserRole = 'attendee' | 'dj' | 'organizer'

export type RoleFlags = {
  attendee: boolean
  dj: boolean
  organizer: boolean
}

export type RouteAccess = 'allow' | 'redirect-explore'

const DEEP_LINK_PATTERN = /^\/e\//
const PUBLIC_ROUTES = ['/login', '/verify']
const STUDIO_ROUTES = ['/queue', '/stats']
// NOTE: startsWith prefix guard — ALL sub-paths under /events/* and /analytics/* are
// organizer-only by design. Do NOT add attendee-facing routes under these prefixes;
// use a different top-level path (e.g. /discover) instead.
const MANAGE_ROUTES = ['/events', '/analytics']

export function hasRole(roleFlags: Partial<RoleFlags>, role: UserRole): boolean {
  return roleFlags[role] === true
}

export function getPrimaryRole(roleFlags: Partial<RoleFlags>): UserRole {
  if (roleFlags.organizer) return 'organizer'
  if (roleFlags.dj) return 'dj'
  return 'attendee'
}

export function getDefaultRoute(roleFlags: Partial<RoleFlags>): string {
  const primary = getPrimaryRole(roleFlags)
  switch (primary) {
    case 'organizer': return '/events'
    case 'dj':        return '/queue'
    default:          return '/explore'
  }
}

export function getRouteAccess(pathname: string, roleFlags: Partial<RoleFlags>): RouteAccess {
  if (DEEP_LINK_PATTERN.test(pathname)) return 'allow'
  if (PUBLIC_ROUTES.includes(pathname)) return 'allow'

  const isStudioRoute = STUDIO_ROUTES.some(r => pathname.startsWith(r))
  if (isStudioRoute) return roleFlags.dj ? 'allow' : 'redirect-explore'

  const isManageRoute = MANAGE_ROUTES.some(r => pathname.startsWith(r))
  if (isManageRoute) return roleFlags.organizer ? 'allow' : 'redirect-explore'

  return 'allow'
}
