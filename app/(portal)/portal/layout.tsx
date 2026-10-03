import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#484f5a',
}

export const metadata: Metadata = {
  title: 'Client Portal',
  manifest: '/portal-manifest.json',
  icons: {
    apple: '/portal-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Client Portal',
  },
  formatDetection: { telephone: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
