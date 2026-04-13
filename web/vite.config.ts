import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc'
import UnoCSS from 'unocss/vite'
import svgr from 'vite-plugin-svgr'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), UnoCSS(), svgr()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false
  },
  server: {
    allowedHosts: ['druuw-3-0-181-53.run.pinggy-free.link'],
    proxy: {
      '/api': 'http://localhost:5454',
      // Proxy WebSocket shell endpoint first (more specific path first)
      '/ws/shell': {
        target: 'http://localhost:5454',
        ws: true,
        changeOrigin: true
      },
      // Proxy general WebSocket event stream
      '/ws': {
        target: 'http://localhost:5454',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
