import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Auto-detect: Vercel uses '/', GitHub Pages uses '/Stream-Recorder/'
const isVercel = process.env.VERCEL === '1'

// https://vite.dev/config/
export default defineConfig({
  base: isVercel ? '/' : '/Stream-Recorder/',
  plugins: [react()],
})
