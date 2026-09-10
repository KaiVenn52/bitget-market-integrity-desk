import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Remotion reads its assets from /public; the product app does not ship them.
  publicDir: false,
  server: { port: 4173, strictPort: true },
})
