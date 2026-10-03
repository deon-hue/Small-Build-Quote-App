// The public address the visitor is actually on (https://app.buildospro.ai, or the old netlify.app address).
//
// In route handlers on Netlify, `new URL(request.url).origin` can be the internal deploy address
// (https://<deploy-id>--<site>.netlify.app) instead of the address in the visitor's browser, so a redirect built
// from it sends people somewhere their sign-in cookie doesn't exist. Prefer the forwarded host header; if that is
// also an internal deploy address, fall back to NEXT_PUBLIC_APP_URL.

const DEPLOY_HOST = /^[0-9a-f]{8,}--/i

function isDeployHost(host: string): boolean {
  return DEPLOY_HOST.test(host)
}

export function siteOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const hostHeader = request.headers.get('host')?.trim()
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || url.protocol.replace(':', '')

  for (const host of [forwardedHost, hostHeader, url.host]) {
    if (host && !isDeployHost(host)) return `${proto}://${host}`
  }

  const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  return configured || url.origin
}
