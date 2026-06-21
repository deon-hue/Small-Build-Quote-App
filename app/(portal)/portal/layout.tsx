import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#484f5a',
}

export const metadata: Metadata = {
  manifest: '/portal-manifest.json',
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
