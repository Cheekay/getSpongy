import { createServiceClient } from '@/lib/supabase/service'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> {
  const admin = createServiceClient()
  const { data: rows, error } = await admin
    .from('device_tokens')
    .select('token, platform')
    .eq('user_id', userId)

  if (error || !rows || rows.length === 0) return

  const messages = rows.map((row: { token: string; platform: string }) => ({
    to: row.token,
    title,
    body,
    data,
    sound: 'default' as const,
  }))

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })
    if (!res.ok) {
      console.error('[notifications] Expo push failed:', res.status, await res.text())
    }
  } catch (err) {
    console.error('[notifications] Expo push error:', err)
  }
}
