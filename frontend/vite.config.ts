import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
  build: {
    base: process.env.VITE_BASE || '/',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-motion': ['motion', 'framer-motion'],
          'vendor-animation': ['gsap', 'animejs', 'split-type'],
          'vendor-charts': ['recharts'],
          'vendor-flow': ['reactflow'],
          'vendor-editor': ['monaco-editor', '@monaco-editor/react'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-icons': ['lucide-react'],
          'vendor-analytics': ['@sentry/react', 'posthog-js'],
          'vendor-misc': ['axios', 'qrcode.react', 'cobe'],
        },
      },
    },
  },
})
