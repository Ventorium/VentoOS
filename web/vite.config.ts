import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react(), UnoCSS(), svgr()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
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
