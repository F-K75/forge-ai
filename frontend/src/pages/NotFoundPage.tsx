import { Link } from 'react-router-dom'
import { Hammer, Home, ArrowLeft } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

export default function NotFoundPage() {
  const reduceMotion = useReducedMotion()

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
          <Link to="/home" className="bb-btn bb-btn-primary">
            <Home size={14} aria-hidden="true" />
            Go to home
          </Link>
          <Link to="/" className="bb-btn bb-btn-outlined">
            <ArrowLeft size={14} aria-hidden="true" />
            Dashboard
          </Link>
        </div>
      </motion.main>
    </div>
  )
}
