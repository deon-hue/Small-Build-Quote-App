import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1e3a5f',
}

export const metadata: Metadata = {
  title: 'The Small Build Co | Subcontractor Portal',
  manifest: '/sub-portal-manifest.json',
  icons: {
    apple: '/portal-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SBC Sub Portal',
  },
  formatDetection: { telephone: false },
}

export default function SubPortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
