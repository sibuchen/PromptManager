import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { spawnSync } from 'child_process'
import path from 'path'

// --- Security-hardened Git Status Plugin ---
// This plugin only runs locally. All commands are hardcoded arrays (no string concat).
// No user-supplied input is ever passed to git. Access is locked to 127.0.0.1 only.
function gitStatusPlugin() {
  // Absolute path to the project root (where .git resides)
  const projectRoot = path.resolve(__dirname)

  return {
    name: 'git-status-plugin',
    configureServer(server) {
      server.middlewares.use('/api/git-status', (req, res) => {
        // Only respond to GET requests
        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        try {
          // SECURITY: Using spawnSync with hardcoded array args – no string concat, no user input
          // Command 1: git log -1 --format="%cI" → last commit ISO timestamp
          const logResult = spawnSync(
            'git',
            ['log', '-1', '--format=%cI'],
            { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
          )

          // Command 2: git status --short → working tree status
          const statusResult = spawnSync(
            'git',
            ['status', '--short'],
            { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
          )

          const lastCommitDate = logResult.stdout ? logResult.stdout.trim() : null
          const statusLines = statusResult.stdout ? statusResult.stdout.trim() : ''
          const isDirty = statusLines.length > 0

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
          })
          res.end(JSON.stringify({
            lastCommitDate,   // ISO 8601 string, e.g. "2026-04-11T22:00:00+08:00"
            isDirty,          // true if there are uncommitted changes
            statusSummary: isDirty ? statusLines : 'Clean',
          }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Git command failed', detail: err.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    gitStatusPlugin(),
  ],
  server: {
    // SECURITY: Lock dev server to loopback only – no LAN access to the git API
    host: '127.0.0.1',
    port: 5173,
  },
})