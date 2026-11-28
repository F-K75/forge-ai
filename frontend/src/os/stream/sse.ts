/**
 * Incremental Server-Sent Events frame parser (WHATWG event-stream subset).
 *
 * Feed decoded text chunks with `push`; complete frames (terminated by a blank
 * line) are emitted through `onFrame`. Handles `\n`, `\r\n` and `\r` line
 * endings, multi-line `data:` fields, `id:`/`event:`/`retry:` fields and `:`
 * comments. A frame that grows beyond `maxFrameBytes` before its terminator is
 * never buffered in full: the parser switches to skip mode, discards input up
 * to the next frame boundary and reports it once through `onOversized`.
 */

export interface SseFrame {
  id: string | null
  event: string | null
  data: string
  retry: number | null
}

export interface SseParserOptions {
  onFrame: (frame: SseFrame) => void
  onOversized?: (approxBytes: number) => void
  /** Upper bound on one frame's size (characters ~ bytes for JSON). Default 1 MiB. */
  maxFrameBytes?: number
}

export interface SseParser {
  push: (chunk: string) => void
  /** Drop any partial frame (call when the underlying connection is replaced). */
  reset: () => void
}

export const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024

function parseFrame(block: string): SseFrame | null {
  let id: string | null = null
  let event: string | null = null
  let retry: number | null = null
  const data: string[] = []
  let sawData = false
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue
    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)
    switch (field) {
      case "data":
        data.push(value)
        sawData = true
        break
      case "id":
        // Per spec, an id containing NUL is ignored.
        if (!value.includes("\u0000")) id = value
        break
      case "event":
        event = value
        break
      case "retry":
        if (/^\d+$/.test(value)) retry = Number(value)
        break
      default:
        break
    }
  }
  if (!sawData) return null
  return { id, event, data: data.join("\n"), retry }
}

export function createSseParser(options: SseParserOptions): SseParser {
  const max = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES
  let buffer = ""
  let skipping = false
  let skipped = 0
  let pendingCr = false

  const normalise = (chunk: string): string => {
    let text = chunk
    if (pendingCr) {
      text = "\r" + text
      pendingCr = false
    }
    // A trailing lone CR may be the first half of CRLF split across chunks.
    if (text.endsWith("\r")) {
      pendingCr = true
      text = text.slice(0, -1)
    }
    return text.replace(/\r\n?/g, "\n")
  }

  const push = (chunk: string) => {
    buffer += normalise(chunk)
    for (;;) {
      const end = buffer.indexOf("\n\n")
      if (end === -1) break
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      if (skipping) {
        skipping = false
        options.onOversized?.(skipped + block.length)
        skipped = 0
        continue
      }
      if (block.length > max) {
        options.onOversized?.(block.length)
        continue
      }
      const frame = parseFrame(block)
      if (frame) options.onFrame(frame)
    }
    if (buffer.length > max) {
      // Keep only a short tail so a "\n\n" split across chunks is still detected.
      skipped += buffer.length - 1
      buffer = buffer.slice(-1)
      skipping = true
    }
  }

  return {
    push,
    reset: () => {
      buffer = ""
      skipping = false
      skipped = 0
      pendingCr = false
    },
  }
}
