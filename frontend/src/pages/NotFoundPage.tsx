import { Link } from 'react-router-dom'
import { Hammer, Home, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-6">
      <main className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-panel border border-border mb-6">
          <Hammer size={24} className="text-accent" aria-hidden="true" />
        </div>
        <h1 className="text-4xl font-bold text-ink mb-2">404</h1>
        <p className="text-base font-medium text-ink mb-2">Page not found</p>
        <p className="text-sm text-muted mb-8">
          This page doesn't exist or was moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/home"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Home size={14} aria-hidden="true" />
            Go to home
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-panel border border-border text-sm text-ink hover:bg-panel-alt transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
