import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#484f5a',
}

export const metadata: Metadata = {
  title: 'The Small Build Co | Your Project Portal',
  manifest: '/portal-manifest.json',
  icons: {
    apple: '/portal-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SBC Portal',
  },
  formatDetection: { telephone: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
