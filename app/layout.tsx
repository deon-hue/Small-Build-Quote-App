import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import EnvGuard from '@/components/EnvGuard'
import { PRODUCT_NAME } from '@/lib/product-config'

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `${PRODUCT_NAME} — quoting, jobs and client portals for builders.`,
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: PRODUCT_NAME,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  // The staging copy must never appear in search results
  ...(process.env.NEXT_PUBLIC_APP_ENV === 'staging' ? { robots: { index: false, follow: false } } : {}),
}

export const viewport: Viewport = {
  themeColor: '#3a4149',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <EnvGuard />
        <PWARegister />
        {children}
      </body>
    </html>
  )
}
