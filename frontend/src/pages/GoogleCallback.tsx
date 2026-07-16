import { useEffect } from 'react'

export default function GoogleCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const userJson = params.get('user')

    if (accessToken && refreshToken && userJson) {
      try {
        const user = JSON.parse(decodeURIComponent(userJson))
        // Set cookies from the URL params so the parent app can pick them up
        document.cookie = `access_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`
        document.cookie = `refresh_token=${refreshToken}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict`
        
        // Notify parent window
        window.opener?.postMessage({
          type: 'google-oauth-success',
          user,
        }, window.location.origin)
      } catch {
        window.opener?.postMessage({
          type: 'google-oauth-error',
          error: 'Invalid user payload',
        }, window.location.origin)
      }
    } else {
      window.opener?.postMessage({
        type: 'google-oauth-error',
        error: 'Missing tokens from OAuth callback',
      }, window.location.origin)
    }

    // Close the popup after a short delay
    setTimeout(() => window.close(), 100)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center text-sm">
      Completing sign-in...
    </div>
  )
}