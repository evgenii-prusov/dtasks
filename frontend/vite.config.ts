import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Docker's frontend-build stage has no .git (see .dockerignore), so it passes the
// commit via the VITE_APP_VERSION env var (set from the GIT_SHA build arg in the
// Dockerfile). Local dev/builds fall back to reading git directly.
function appVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: {
    proxy: {
      // Not 8000: sibling local projects (e.g. dcash) default there too.
      // Keep in sync with Makefile's DEV_BACKEND_PORT.
      '/api': 'http://localhost:8010',
    },
  },
})
