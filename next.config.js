const { execSync } = require('child_process')

// Short commit id shown in the on-screen build stamp. Netlify provides COMMIT_REF at build
// time; locally we ask git; anything else falls back to 'dev'.
function commit() {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: commit(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  },
}

module.exports = nextConfig
