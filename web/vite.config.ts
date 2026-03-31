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
    proxy: {
      '/api': 'http://localhost:5454',
      '/ws': {
        target: 'http://localhost:5454',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
