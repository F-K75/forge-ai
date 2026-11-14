/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_ADMIN_EMAILS?: string
  readonly VITE_SENTRY_DSN?: string
  /** Public demo build only: the real app's URL, for sign-in/sign-up links. */
  readonly VITE_PUBLIC_DEMO_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}