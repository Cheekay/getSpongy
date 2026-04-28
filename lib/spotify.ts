// Spotify track search via Client Credentials flow (no user login required).
// Full implementation in Phase 2.

export type SpotifyTrack = {
  id: string
  title: string
  artist: string
  albumArtUrl: string | null
  durationMs: number
}

const SEARCH_LIMIT = 8

let cachedToken: string | null = null
let tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set')
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
  } as RequestInit & { next?: { revalidate?: number } })

  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('Spotify auth returned no token')
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

export async function searchTracks(query: string): Promise<SpotifyTrack[]> {
  const token = await getAccessToken()
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${SEARCH_LIMIT}&market=US`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.ok) {
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.tracks.items.map((item: any) => ({
      id: item.id,
      title: item.name,
      artist: item.artists.map((a: { name: string }) => a.name).join(', '),
      albumArtUrl: item.album?.images?.[0]?.url ?? null,
      durationMs: item.duration_ms,
    }))
  }

  // DEV FALLBACK — remove once Spotify developer account has Premium
  return mockSearch(query)
}

const MOCK_TRACKS: SpotifyTrack[] = [
  { id: 'mock-1',  title: 'On The Low',              artist: 'Burna Boy',            albumArtUrl: null, durationMs: 218000 },
  { id: 'mock-2',  title: 'Last Last',                artist: 'Burna Boy',            albumArtUrl: null, durationMs: 243000 },
  { id: 'mock-3',  title: 'Love Damini',              artist: 'Burna Boy',            albumArtUrl: null, durationMs: 198000 },
  { id: 'mock-4',  title: 'Essence',                  artist: 'Wizkid ft. Tems',      albumArtUrl: null, durationMs: 253000 },
  { id: 'mock-5',  title: 'Joro',                     artist: 'Wizkid',               albumArtUrl: null, durationMs: 222000 },
  { id: 'mock-6',  title: 'Sability',                 artist: 'Rema',                 albumArtUrl: null, durationMs: 211000 },
  { id: 'mock-7',  title: 'Calm Down',                artist: 'Rema',                 albumArtUrl: null, durationMs: 239000 },
  { id: 'mock-8',  title: 'Woman',                    artist: 'Doja Cat',             albumArtUrl: null, durationMs: 197000 },
  { id: 'mock-9',  title: 'Paint The Town Red',       artist: 'Doja Cat',             albumArtUrl: null, durationMs: 214000 },
  { id: 'mock-10', title: 'Creepin\'',                artist: 'Metro Boomin ft. The Weeknd', albumArtUrl: null, durationMs: 221000 },
  { id: 'mock-11', title: 'Die For You',              artist: 'The Weeknd',           albumArtUrl: null, durationMs: 260000 },
  { id: 'mock-12', title: 'Blinding Lights',          artist: 'The Weeknd',           albumArtUrl: null, durationMs: 200000 },
  { id: 'mock-13', title: 'Rich Flex',                artist: 'Drake & 21 Savage',    albumArtUrl: null, durationMs: 231000 },
  { id: 'mock-14', title: 'God\'s Plan',              artist: 'Drake',                albumArtUrl: null, durationMs: 198000 },
  { id: 'mock-15', title: 'Underwater',               artist: 'Tems',                 albumArtUrl: null, durationMs: 203000 },
  { id: 'mock-16', title: 'Free Mind',                artist: 'Tems',                 albumArtUrl: null, durationMs: 214000 },
  { id: 'mock-17', title: 'Mnike',                    artist: 'Tyler ICU & Tumelo.za', albumArtUrl: null, durationMs: 235000 },
  { id: 'mock-18', title: 'Unavailable',              artist: 'Davido ft. Musa Keys', albumArtUrl: null, durationMs: 229000 },
  { id: 'mock-19', title: 'Ke Star',                  artist: 'Focalistic ft. Davido', albumArtUrl: null, durationMs: 208000 },
  { id: 'mock-20', title: 'Midnight Marauders',       artist: 'A Tribe Called Quest', albumArtUrl: null, durationMs: 271000 },
  { id: 'mock-21', title: 'HUMBLE.',                  artist: 'Kendrick Lamar',       albumArtUrl: null, durationMs: 177000 },
  { id: 'mock-22', title: 'Not Like Us',              artist: 'Kendrick Lamar',       albumArtUrl: null, durationMs: 274000 },
  { id: 'mock-23', title: 'Jamila',                   artist: 'Omah Lay',             albumArtUrl: null, durationMs: 196000 },
  { id: 'mock-24', title: 'Soso',                     artist: 'Omah Lay',             albumArtUrl: null, durationMs: 187000 },
  { id: 'mock-25', title: 'Ojuelegba',                artist: 'Wizkid',               albumArtUrl: null, durationMs: 224000 },
]

function mockSearch(query: string): SpotifyTrack[] {
  const q = query.toLowerCase()
  return MOCK_TRACKS
    .filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    .slice(0, SEARCH_LIMIT)
}
