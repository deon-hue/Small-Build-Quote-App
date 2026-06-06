import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep @react-pdf/renderer as an external Node.js module.
  // If bundled by webpack it exposes browser-incompatible React internals
  // causing "Minified React error #31" at runtime.
  serverExternalPackages: ['@react-pdf/renderer'],
}

export default nextConfig
