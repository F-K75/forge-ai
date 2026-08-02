import { Link, useLocation } from 'react-router-dom'
import { Hammer, Home, ArrowLeft } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useAuthStore } from '../store/authStore'

export default function NotFoundPage() {
  const reduceMotion = useReducedMotion()
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  const isInApp = location.pathname.startsWith('/projects') || location.pathname.startsWith('/build') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/billing') || location.pathname.startsWith('/initiatives') || location.pathname.startsWith('/reviews') || location.pathname.startsWith('/marketplace') || location.pathname.startsWith('/admin')
  const dashboardHref = isAuthenticated ? '/projects' : '/home'
  const dashboardLabel = isAuthenticated ? 'Dashboard' : 'Home'
  const DashboardIcon = isAuthenticated ? Home : ArrowLeft

  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <motion.main
        className="max-w-sm text-center"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl glass">
          <Hammer size={24} className="text-accent" aria-hidden="true" />
        </div>
        <p className="mb-2 font-mono text-caption uppercase tracking-[0.14em] text-muted">Error 404</p>
        <h1 className="mb-2 font-display text-display text-ink">Page not found</h1>
        <p className="mb-8 text-body text-muted">
          This page doesn&apos;t exist or was moved.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={dashboardHref} className="bb-btn bb-btn-primary">
            <DashboardIcon size={14} aria-hidden="true" />
            {dashboardLabel}
          </Link>
          {isInApp && (
            <button type="button" onClick={() => window.history.back()} className="bb-btn bb-btn-outlined">
              <ArrowLeft size={14} aria-hidden="true" />
              Go back
            </button>
          )}
        </div>
      </motion.main>
    </div>
  )
}
