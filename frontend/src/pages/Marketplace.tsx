import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, Tag, Download, Star, ExternalLink, Package, Plus, ShoppingBag, BookTemplate } from 'lucide-react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { EmptyState } from '../components/ui/EmptyState'

export default function Marketplace() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'template' | 'prompt'>('template')

  const { data: items, isLoading, isError, refetch } = useQuery({
    queryKey: ['marketplace', type, search],
    queryFn: () => api.get('/marketplace', { params: { type, search } }).then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-forge-bg text-forge-text p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-48 bg-forge-surface rounded animate-pulse mb-2" aria-label="Loading" />
            <div className="h-4 w-64 bg-forge-surface rounded animate-pulse" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading marketplace items">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-forge-surface border border-forge-border rounded-xl p-6" aria-hidden="true">
                <div className="h-6 w-3/4 bg-forge-bg rounded animate-pulse mb-3" />
                <div className="h-4 w-full bg-forge-bg rounded animate-pulse mb-2" />
                <div className="h-4 w-5/6 bg-forge-bg rounded animate-pulse mb-4" />
                <div className="flex gap-2 mb-4">
                  <div className="h-5 w-16 bg-forge-bg rounded-full animate-pulse" />
                  <div className="h-5 w-20 bg-forge-bg rounded-full animate-pulse" />
                </div>
                <div className="h-9 w-full bg-forge-bg rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-forge-bg text-forge-text p-6 flex items-center justify-center">
        <div className="text-center" role="alert">
          <h3 className="text-xl font-semibold text-red-400 mb-2">Failed to load marketplace</h3>
          <p className="text-forge-text-secondary mb-4">Something went wrong. Please try again.</p>
          <button 
            onClick={() => refetch()}
            className="px-6 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-500 transition focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-forge-bg text-forge-text p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Marketplace</h1>
          <p className="text-forge-text-secondary">Discover templates and prompts from the community</p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-secondary" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates..."
              aria-label="Search templates"
              className="w-full pl-10 pr-4 py-2 bg-forge-surface border border-forge-border rounded-xl text-white placeholder-forge-text-secondary focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="flex items-center gap-2 bg-forge-surface border border-forge-border rounded-xl p-1" role="tablist">
            {['template', 'prompt'].map(t => (
              <button
                key={t}
                onClick={() => setType(t as any)}
                role="tab"
                aria-selected={type === t}
                className={clsx(
                  'px-4 py-1.5 text-sm font-medium rounded-lg transition capitalize focus:outline-none focus:ring-2 focus:ring-violet-500',
                  type === t ? 'bg-violet-600 text-white' : 'text-forge-text-secondary hover:text-white'
                )}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Marketplace items">
          {items?.length > 0 ? (
            items.map((item: any) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-forge-surface border border-forge-border rounded-xl p-6 flex flex-col hover:bg-forge-border transition"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-forge-text-secondary mb-4 line-clamp-3">{item.description}</p>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {item.tags?.map((tag: string) => (
                      <span key={tag} className="px-2 py-1 text-xs bg-forge-bg border border-forge-border rounded-full text-forge-text-secondary">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-forge-text-secondary">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4" aria-hidden="true" />
                      <span aria-label={`Rating: ${item.rating?.toFixed(1) ?? '0.0'}`}>
                        {item.rating?.toFixed(1) ?? '0.0'} ({item.rating_count ?? 0})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span aria-label={`${item.downloads ?? 0} downloads`}>{item.downloads ?? 0}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => api.post(`/marketplace/${item.id}/download`).then(r => {
                    navigator.clipboard.writeText(r.data.prompt)
                  }).catch(() => {})}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                  aria-label={`Use ${item.title} template`}
                >
                  Use template
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </button>
              </motion.div>
            ))
          ) : (
            <EmptyState
              icon={BookTemplate}
              title={search ? 'No results found' : 'No templates yet'}
              description={search ? 'Try different search keywords or clear your search.' : 'Be the first to create a template for this category. Templates help others get started quickly.'}
              primaryAction={search ? undefined : { label: 'Create template', onClick: () => console.log('Create template') }}
              secondaryAction={search ? { label: 'Clear search', onClick: () => setSearch('') } : { label: 'Browse all categories', onClick: () => setSearch('') }}
            />
          )}
        </div>
      </div>
    </div>
  )
}