// Launcher for estimator-demo (separate Next.js project)
const { spawn } = require('child_process')
const path = require('path')

const estimatorDir = path.join('C:\\', 'Users', 'deonh', 'OneDrive', 'Desktop', 'estimator-demo')

const proc = spawn('npm', ['run', 'dev', '--', '-p', '3001'], {
  cwd: estimatorDir,
  stdio: 'inherit',
  shell: true,
})

proc.on('error', (err) => {
  console.error('Failed to start estimator-demo:', err)
  process.exit(1)
})

proc.on('exit', (code) => {
  process.exit(code || 0)
})
