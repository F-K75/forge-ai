import { Link, useLocation } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import BrandLogo from '../components/BrandLogo'
import { useAuthStore } from '../store/authStore'

export default function NotFoundPage() {
  const reduceMotion = useReducedMotion()
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  const isInApp = location.pathname.startsWith('/projects') || location.pathname.startsWith('/build') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/billing') || location.pathname.startsWith('/initiatives') || location.pathname.startsWith('/reviews') || location.pathname.startsWith('/marketplace') || location.pathname.startsWith('/admin') || location.pathname.startsWith('/flow')
  const dashboardHref = isAuthenticated ? '/projects' : '/home'
  const dashboardLabel = isAuthenticated ? 'Dashboard' : 'Home'
  const DashboardIcon = isAuthenticated ? Home : ArrowLeft

  return (
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <motion.main
        className="max-w-md w-full rounded-sm border-3 border-black bg-white dark:bg-[#18181C] p-8 shadow-brutal-lg text-center"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-sm border-2 border-black bg-brutal-yellow shadow-brutal-sm">
          <BrandLogo size="lg" />
        </div>
        <div>
          <span className="mb-3 inline-block rounded-sm border-2 border-black bg-brutal-pink text-black px-3 py-1 font-mono text-xs font-black uppercase tracking-widest shadow-brutal-xs">
            Error 404
          </span>
        </div>
        <h1 className="mb-2 font-mono text-2xl sm:text-3xl font-black uppercase tracking-tight text-ink">
          Page Not Found
        </h1>
        <p className="mb-8 font-mono text-xs sm:text-sm text-muted">
          The requested route doesn&apos;t exist or was relocated.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={dashboardHref}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm border-2 border-black bg-brutal-yellow text-black font-mono font-extrabold text-xs uppercase tracking-wider shadow-brutal-sm hover:bg-[#2DD4BF] active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            <DashboardIcon size={14} aria-hidden="true" />
            {dashboardLabel}
          </Link>
          {isInApp && (
            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm border-2 border-black bg-white dark:bg-[#121216] text-ink font-mono font-bold text-xs uppercase tracking-wider shadow-brutal-xs hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] transition-all"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Go back
            </button>
          )}
        </div>
      </motion.main>
    </div>
  )
}
