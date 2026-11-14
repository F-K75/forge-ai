import { describe, expect, it, vi } from 'vitest'
import { resolveGeminiPlugin } from '../../vite-plugins/loadGeminiPlugin'
import type { PluginOption } from 'vite'

describe('resolveGeminiPlugin', () => {
  it('returns null for production build command without calling loader', async () => {
    const loader = vi.fn()
    const result = await resolveGeminiPlugin({
      command: 'build',
      mode: 'production',
      loader,
    })

    expect(result).toBeNull()
    expect(loader).not.toHaveBeenCalled()
  })

  it('returns null for test mode even when command is serve without calling loader', async () => {
    const loader = vi.fn()
    const result = await resolveGeminiPlugin({
      command: 'serve',
      mode: 'test',
      loader,
    })

    expect(result).toBeNull()
    expect(loader).not.toHaveBeenCalled()
  })

  it('returns plugin instance when command is serve and loader succeeds', async () => {
    const mockPlugin: PluginOption = { name: 'forge-gemini-live-plugin' }
    const loader = vi.fn().mockResolvedValue({
      geminiPlugin: () => mockPlugin,
    })

    const result = await resolveGeminiPlugin({
      command: 'serve',
      mode: 'development',
      loader,
    })

    expect(result).toBe(mockPlugin)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('gracefully returns null when loader throws (e.g. missing @google/genai module)', async () => {
    const loader = vi.fn().mockRejectedValue(
      new Error("Cannot find package '@google/genai' imported from frontend/vite-plugins/geminiPlugin.ts"),
    )

    const result = await resolveGeminiPlugin({
      command: 'serve',
      mode: 'development',
      loader,
    })

    expect(result).toBeNull()
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
