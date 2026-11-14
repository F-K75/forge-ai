import { describe, expect, it } from 'vitest'
import { resolveWsBaseUrl } from './wsUrl'

describe('resolveWsBaseUrl', () => {
  it('returns explicit VITE_WS_URL when non-empty and strips trailing slashes', () => {
    expect(
      resolveWsBaseUrl('wss://ws.forge.example/', {
        hostname: 'app.forge.example',
        protocol: 'https:',
        host: 'app.forge.example',
      }),
    ).toBe('wss://ws.forge.example')
  })

  it('defaults to ws://localhost:8000 on localhost when VITE_WS_URL is empty', () => {
    expect(
      resolveWsBaseUrl('', {
        hostname: 'localhost',
        protocol: 'http:',
        host: 'localhost:5173',
      }),
    ).toBe('ws://localhost:8000')
  })

  it('defaults to ws://localhost:8000 on 127.0.0.1 when VITE_WS_URL is undefined', () => {
    expect(
      resolveWsBaseUrl(undefined, {
        hostname: '127.0.0.1',
        protocol: 'http:',
        host: '127.0.0.1:5173',
      }),
    ).toBe('ws://localhost:8000')
  })

  it('derives wss:// from https: origin in production when VITE_WS_URL is empty', () => {
    expect(
      resolveWsBaseUrl('', {
        hostname: 'app.forgeai.dev',
        protocol: 'https:',
        host: 'app.forgeai.dev',
      }),
    ).toBe('wss://app.forgeai.dev')
  })

  it('derives ws:// from http: non-local origin including port when VITE_WS_URL is empty', () => {
    expect(
      resolveWsBaseUrl('   ', {
        hostname: 'staging.internal',
        protocol: 'http:',
        host: 'staging.internal:8080',
      }),
    ).toBe('ws://staging.internal:8080')
  })

  it('falls back to ws://localhost:8000 when location is unavailable', () => {
    expect(resolveWsBaseUrl('', undefined)).toBe('ws://localhost:8000')
  })
})
