import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1e2022',
}

export const metadata: Metadata = {
  title: 'Subcontractor Portal',
  // its own app settings, so "Add to Home Screen" from the portal opens the PORTAL (not the builder's app, which is what the main settings start in)
  manifest: '/sub-portal-manifest.json',
  icons: { apple: '/portal-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Sub Portal' },
  formatDetection: { telephone: false },
}

export default function SubPortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
