import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: 'http://localhost:4000', changeOrigin: true },
      '/load': { target: 'http://localhost:4000', changeOrigin: true },
      '/save': { target: 'http://localhost:4000', changeOrigin: true },
      '/share': { target: 'http://localhost:4000', changeOrigin: true },
      '/load_shared': { target: 'http://localhost:4000', changeOrigin: true },
      '/classify': { target: 'http://localhost:4000', changeOrigin: true },
      '/chat': { target: 'http://localhost:4000', changeOrigin: true },
      '/suggest': { target: 'http://localhost:4000', changeOrigin: true },
      '/merge': { target: 'http://localhost:4000', changeOrigin: true },
      '/find': { target: 'http://localhost:4000', changeOrigin: true },
      '/brainstorm': { target: 'http://localhost:4000', changeOrigin: true },
      '/save_settings': { target: 'http://localhost:4000', changeOrigin: true },
      '/load_settings': { target: 'http://localhost:4000', changeOrigin: true },
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
})
