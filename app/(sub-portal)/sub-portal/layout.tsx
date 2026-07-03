import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#1e3a5f',
}

export const metadata: Metadata = {
  title: 'The Small Build Co | Subcontractor Portal',
  formatDetection: { telephone: false },
}

export default function SubPortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
