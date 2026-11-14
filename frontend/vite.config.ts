/// <reference types="vitest" />
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveGeminiPlugin } from './vite-plugins/loadGeminiPlugin'

export default defineConfig(async ({ command, mode }) => {
  const plugins: PluginOption[] = [react()]
  const gemini = await resolveGeminiPlugin({ command, mode })
  if (gemini) {
    plugins.push(gemini)
  }

  return {
    plugins,
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
      env: {
        VITE_API_URL: 'http://localhost:8000',
        VITE_WS_URL: '',
        VITE_LIVE_MODE: 'false',
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      base: process.env.VITE_BASE || '/',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-router': ['react-router-dom'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-motion': ['motion'],
            'vendor-animation': ['gsap', 'animejs', 'split-type'],
            'vendor-charts': ['recharts'],
            'vendor-flow': ['reactflow'],
            'vendor-editor': ['monaco-editor', '@monaco-editor/react'],
            'vendor-dnd': ['@dnd-kit/core'],
            'vendor-icons': ['lucide-react'],
            'vendor-analytics': ['@sentry/react', 'posthog-js'],
            'vendor-misc': ['axios', 'qrcode.react', 'cobe'],
          },
        },
      },
    },
  }
})
