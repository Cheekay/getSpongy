// Spotify track search via Client Credentials flow (no user login required).
// Full implementation in Phase 2.

export type SpotifyTrack = {
  id: string
  title: string
  artist: string
  albumArtUrl: string
  durationMs: number
}

let cachedToken: string | null = null
let tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

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

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

// Implemented in Phase 2
export async function searchTracks(_query: string): Promise<SpotifyTrack[]> {
  await getAccessToken() // validates credentials are set
  throw new Error('searchTracks: not yet implemented (Phase 2)')
}
