import type { NextConfig } from 'next'
import withPWA from '@ducanh2912/next-pwa'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  images: {
    remotePatterns: [
      { hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { hostname: 'lh3.googleusercontent.com' },
    ],
  },
}

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
})(nextConfig)
