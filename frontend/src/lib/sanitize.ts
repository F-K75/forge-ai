const ESCAPE_RE = /[&<>"']/g

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(ESCAPE_RE, match => ESCAPE_MAP[match] ?? match)
}
