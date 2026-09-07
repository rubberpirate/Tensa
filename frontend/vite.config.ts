import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
      '/dialer-api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dialer-api/, '/api/dialer'),
      },
      '/ws/dialer-live': {
        target: 'http://localhost:8001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
