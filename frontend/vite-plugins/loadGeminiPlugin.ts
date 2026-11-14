import type { PluginOption } from 'vite'

export interface ResolveGeminiPluginOptions {
  command?: string
  mode?: string
  loader?: () => Promise<{ geminiPlugin: () => PluginOption }>
}

const GEMINI_PLUGIN_MODULE = './geminiPlugin'

/**
 * Resolves the optional Gemini dev-server middleware plugin.
 *
 * In production build ('build') or test ('test') mode, this returns null without
 * attempting to resolve or import @google/genai, ensuring that production builds
 * and CI pipelines never require an LLM SDK.
 *
 * In dev-server mode ('serve'), it lazily loads the plugin and gracefully
 * degrades to null if @google/genai is not installed in the environment.
 */
export async function resolveGeminiPlugin(
  options: ResolveGeminiPluginOptions = {},
): Promise<PluginOption | null> {
  const {
    command = 'serve',
    mode = 'development',
    loader = () =>
      import(/* @vite-ignore */ GEMINI_PLUGIN_MODULE).then((m) => ({
        geminiPlugin: m.geminiPlugin,
      })),
  } = options

  // Never load during production build or test runs
  if (command !== 'serve' || mode === 'test') {
    return null
  }

  try {
    const { geminiPlugin } = await loader()
    return geminiPlugin()
  } catch {
    // Graceful fallback when @google/genai or geminiPlugin is unavailable
    return null
  }
}
