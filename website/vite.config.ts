import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Shared navigation code must use website settings, not Expo settings.
  tsconfig: "./tsconfig.json",
  plugins: [react()],
})
