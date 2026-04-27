// mobile/app/index.tsx
import { useRef, useState, useEffect } from 'react'
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { StatusBar } from 'expo-status-bar'
import { registerForPushNotifications } from '../lib/notifications'

const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000'

export default function MainScreen() {
  const webViewRef = useRef<WebView>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [pushToken, setPushToken] = useState<string | null>(null)

  useEffect(() => {
    registerForPushNotifications()
      .then((token) => setPushToken(token))
      .catch(() => {})
  }, [])

  function injectPushToken(token: string) {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android'
    const js = `
      window.dispatchEvent(
        new CustomEvent('nativePushToken', {
          detail: { token: ${JSON.stringify(token)}, platform: ${JSON.stringify(platform)} }
        })
      );
      true;
    `
    webViewRef.current?.injectJavaScript(js)
  }

  function handleLoadEnd() {
    setIsLoading(false)
    if (pushToken) injectPushToken(pushToken)
  }

  if (hasError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Unable to connect.</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => {
            setHasError(false)
            setIsLoading(true)
            webViewRef.current?.reload()
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#a78bfa" />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        onLoadEnd={handleLoadEnd}
        onError={() => setHasError(true)}
        allowsBackForwardNavigationGestures
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e13' },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0e0e13',
    zIndex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0e0e13',
    gap: 16,
  },
  errorText: { color: '#e2e8f0', fontSize: 16 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#a78bfa',
    borderRadius: 8,
  },
  retryText: { color: '#0e0e13', fontWeight: '600' },
})
