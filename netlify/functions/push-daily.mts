// Runs once a day (7 in the morning UK winter time, 8 in summer) and asks the app to send each person their morning summary alert.
// The app does the work (app/api/push/daily); this only knocks on its door with the shared secret.

export default async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) return new Response('Not set up', { status: 200 })
  const res = await fetch(`${base.replace(/\/$/, '')}/api/push/daily`, { headers: { 'x-cron-secret': secret } })
  return new Response(await res.text(), { status: 200 })
}

export const config = { schedule: '0 7 * * *' }
