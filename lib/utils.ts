import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCheckinTime(checkedInAt: string | null): string {
  if (!checkedInAt) return ''
  return new Date(checkedInAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function isDuplicateCheckIn(status: string): boolean {
  return status === 'checked_in'
}

export function isEventAtCapacity(capacity: number | null, rsvpCount: number): boolean {
  if (capacity === null) return false
  return rsvpCount >= capacity
}
