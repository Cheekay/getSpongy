/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

describe('searchTracks', () => {
  beforeEach(() => {
    process.env.SPOTIFY_CLIENT_ID = 'test-id'
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
    vi.stubGlobal('fetch', mockFetch)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('maps Spotify track response to SpotifyTrack shape', async () => {
    // Token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    })
    // Search fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: {
          items: [
            {
              id: 'track1',
              name: 'Levitating',
              artists: [{ name: 'Dua Lipa' }],
              album: { images: [{ url: 'https://img.example.com/art.jpg' }] },
              duration_ms: 203000,
            },
          ],
        },
      }),
    })

    const { searchTracks } = await import('@/lib/spotify')
    const results = await searchTracks('levitating')

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 'track1',
      title: 'Levitating',
      artist: 'Dua Lipa',
      albumArtUrl: 'https://img.example.com/art.jpg',
      durationMs: 203000,
    })
  })

  it('joins multiple artists with ", "', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tracks: {
          items: [
            {
              id: 't2',
              name: 'Stay',
              artists: [{ name: 'The Kid LAROI' }, { name: 'Justin Bieber' }],
              album: { images: [] },
              duration_ms: 141000,
            },
          ],
        },
      }),
    })

    const { searchTracks } = await import('@/lib/spotify')
    const results = await searchTracks('stay')
    expect(results[0].artist).toBe('The Kid LAROI, Justin Bieber')
    expect(results[0].albumArtUrl).toBeNull()
  })

  it('returns empty array when Spotify search response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    })
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) })

    const { searchTracks } = await import('@/lib/spotify')
    const results = await searchTracks('anything')
    expect(results).toEqual([])
  })
})
