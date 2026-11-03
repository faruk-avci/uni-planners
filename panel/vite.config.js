import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5174,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_PROXY || 'http://localhost:3001',
          changeOrigin: true,
          // Lets the API's Origin check see the panel's own host (localhost:5174).
          xfwd: true,
        },
      },
    },
  }
})
