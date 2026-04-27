// mobile/app/+not-found.tsx
import { View, Text, StyleSheet } from 'react-native'
import { Link } from 'expo-router'

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Screen not found.</Text>
      <Link href="/" style={styles.link}>Go home</Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0e0e13' },
  text: { color: '#e2e8f0', fontSize: 16, marginBottom: 16 },
  link: { color: '#a78bfa', fontSize: 16 },
})
