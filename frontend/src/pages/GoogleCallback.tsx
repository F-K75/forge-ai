import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useAuthStore } from '../store/authStore'

export default function GoogleCallback() {
  const reduceMotion = useReducedMotion()
  const { fetchMe, user } = useAuthStore()

  useEffect(() => {
    async function complete() {
      try {
        await fetchMe()
        const currentUser = useAuthStore.getState().user
        if (currentUser) {
          window.opener?.postMessage({
            type: 'google-oauth-success',
            user: currentUser,
          }, window.location.origin)
        } else {
          window.opener?.postMessage({
            type: 'google-oauth-error',
            error: 'Sign-in was not completed. Please try again.',
          }, window.location.origin)
        }
      } catch {
        window.opener?.postMessage({
          type: 'google-oauth-error',
          error: 'We couldn\'t complete your sign-in. Please try again.',
        }, window.location.origin)
      }
      setTimeout(() => window.close(), 100)
    }
    complete()
  }, [fetchMe])

  return (
    <div className="min-h-screen flex items-center justify-center text-sm">
      <motion.div
        className="flex items-center gap-2"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Completing sign-in…
      </motion.div>
    </div>
  )
}
