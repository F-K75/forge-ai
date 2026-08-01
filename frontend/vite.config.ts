import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
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
