import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Not 8000: sibling local projects (e.g. dcash) default there too.
      // Keep in sync with Makefile's DEV_BACKEND_PORT.
      '/api': 'http://localhost:8010',
    },
  },
})
