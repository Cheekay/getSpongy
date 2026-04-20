import { describe, it, expect } from 'vitest'
import { containsProfanity } from '@/lib/profanity'

describe('containsProfanity', () => {
  it('returns false for clean text', () => {
    expect(containsProfanity('play something funky please')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(containsProfanity('')).toBe(false)
  })

  it('returns true for text containing a profane word', () => {
    expect(containsProfanity('play some shit tonight')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(containsProfanity('SHIT')).toBe(true)
  })
})
