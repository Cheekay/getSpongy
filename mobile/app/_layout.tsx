// mobile/app/_layout.tsx
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { registerForPushNotifications } from '../lib/notifications'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications().catch(() => {})
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  )
}
