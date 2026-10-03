// Makes the staging copy impossible to mistake for the real app, and stops either site running against the
// wrong database. Rendered once, in the root layout. Nothing shows on the live site when it is set up correctly.
//
//   NEXT_PUBLIC_APP_ENV=staging  → a banner on every page (and the site asks search engines not to index it)
//   a staging site pointed at the LIVE database, or the live site pointed at the STAGING database
//                                → a full-screen warning that blocks the app, so no data is touched by mistake

const LIVE_PROJECT_REF = 'hyjnagjvkofyfidzmypl'
const STAGING_PROJECT_REF = 'xfqjxbvuuguxgieaxfex'

export default function EnvGuard() {
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const usesLiveDb = supabaseUrl.includes(LIVE_PROJECT_REF)
  const usesStagingDb = supabaseUrl.includes(STAGING_PROJECT_REF)

  const mismatch =
    (isStaging && usesLiveDb) ? 'This STAGING site is connected to the LIVE database.' :
    (!isStaging && usesStagingDb) ? 'This LIVE site is connected to the STAGING database.' : ''

  if (mismatch) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100000, background: '#7a1f17', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Stopped for safety</div>
          <div style={{ fontSize: 16, lineHeight: 1.5 }}>
            {mismatch} Nothing has been changed. Check the Supabase settings (environment variables) for this site.
          </div>
        </div>
      </div>
    )
  }

  if (!isStaging) return null

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 99999, background: '#f5a623', color: '#1e2022',
      textAlign: 'center', fontSize: 12, fontWeight: 800, letterSpacing: 1, padding: '5px 8px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      STAGING — TEST COPY · made-up data only · changes here do not affect the real app
    </div>
  )
}
