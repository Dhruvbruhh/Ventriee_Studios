import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate web app; its own build, independent of the Electron bundle.
export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
  test: { environment: 'node', globals: true },
})
