import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Users, CreditCard, Activity, Shield, Settings, BarChart3, AlertTriangle, FileCode2, Download } from 'lucide-react'
import { useState, useEffect } from 'react'

interface User {
  id: string
  email: string
  name: string
  plan: string
  credits: number
  created_at: string
}

interface Build {
  id: string
  status: string
  credits_used: number
  created_at: string
}

interface AnalyticsOverview {
  total_users: number
  total_builds: number
  total_revenue: number
  active_subscriptions: number
}

export default function AdminDashboard() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'builds' | 'analytics'>('overview')
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')
  
  const { data: overview } = useQuery({
    queryKey: ['admin-overview', dateRange],
    queryFn: () => api.get('/admin/analytics/overview', { params: { range: dateRange } }).then(r => r.data),
  })

  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => api.get('/admin/users', { params: { search } }).then(r => r.data),
  })

  const { data: builds } = useQuery({
    queryKey: ['admin-builds', dateRange],
    queryFn: () => api.get('/admin/builds', { params: { per_page: 20 } }).then(r => r.data),
  })

  const creditMutation = useMutation({
    mutationFn: (data: { user_id: string; amount: number; reason: string }) =>
      api.post('/admin/billing/adjust', data).then(r => r.data),
    onSuccess: () => refetchUsers(),
  })

  const handleCreditAdjust = (userId: string, amount: number) => {
    creditMutation.mutate({ user_id: userId, amount, reason: 'admin_adjustment' })
  }

  const handleExport = () => {
    api.get('/admin/users/export').then(r => {
      const csv = r.data
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'users.csv'
      a.click()
    })
  }

  return (
    <div className="min-h-screen bg-forge-bg text-forge-text">
      <div className="flex h-screen">
        <aside className="w-64 border-r border-forge-border bg-forge-surface/50 p-4 flex-shrink-0" role="navigation" aria-label="Admin navigation">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600">
              <Shield className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <span className="text-xl font-bold text-white">Forge Admin</span>
          </div>

          <nav className="space-y-2" role="tablist" aria-label="Admin sections">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'builds', label: 'Builds', icon: FileCode2 },
              { id: 'analytics', label: 'Analytics', icon: Activity },
            ].map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  role="tab"
                  aria-selected={activeTab === item.id}
                  aria-controls={`${item.id}-panel`}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    activeTab === item.id
                      ? 'bg-violet-600 text-white'
                      : 'text-forge-text-secondary hover:bg-forge-surface'
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'overview' && (
            <section id="overview-panel" role="tabpanel" aria-labelledby="overview-tab">
              <h1 className="text-2xl font-bold text-white mb-6">Dashboard Overview</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="list" aria-label="Key metrics">
                <div className="bg-forge-surface border border-forge-border rounded-xl p-6" role="listitem" aria-label="Total users">
                  <div className="text-sm text-forge-text-secondary mb-2">Total Users</div>
                  <div className="text-3xl font-bold text-white">{overview?.total_users ?? 0}</div>
                </div>
                <div className="bg-forge-surface border border-forge-border rounded-xl p-6" role="listitem" aria-label="Total builds">
                  <div className="text-sm text-forge-text-secondary mb-2">Total Builds</div>
                  <div className="text-3xl font-bold text-white">{overview?.total_builds ?? 0}</div>
                </div>
                <div className="bg-forge-surface border border-forge-border rounded-xl p-6" role="listitem" aria-label="Total revenue">
                  <div className="text-sm text-forge-text-secondary mb-2">Total Revenue</div>
                  <div className="text-3xl font-bold text-white">${overview?.total_revenue ?? 0}</div>
                </div>
                <div className="bg-forge-surface border border-forge-border rounded-xl p-6" role="listitem" aria-label="Active subscriptions">
                  <div className="text-sm text-forge-text-secondary mb-2">Active Subscriptions</div>
                  <div className="text-3xl font-bold text-white">{overview?.active_subscriptions ?? 0}</div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'users' && (
            <section id="users-panel" role="tabpanel" aria-labelledby="users-tab">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-white">Users</h1>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search users..."
                    aria-label="Search users"
                    className="bg-forge-surface border border-forge-border rounded-xl px-4 py-2 text-white placeholder-forge-text-secondary w-64 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <button
                    onClick={handleExport}
                    aria-label="Export users to CSV"
                    className="px-4 py-2 rounded-xl border border-forge-border text-forge-text-secondary hover:bg-forge-surface transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="bg-forge-surface border border-forge-border rounded-xl overflow-hidden">
                <table className="w-full" role="table" aria-label="Users table">
                  <thead className="border-b border-forge-border">
                    <tr className="text-left" role="row">
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Email</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Name</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Plan</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Credits</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users?.users?.map((user: User) => (
                      <tr key={user.id} className="border-b border-forge-border last:border-0" role="row">
                        <td className="px-6 py-4 text-sm text-white">{user.email}</td>
                        <td className="px-6 py-4 text-sm text-forge-text-secondary">{user.name}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`capitalize ${user.plan === 'free' ? 'text-forge-text-secondary' : 'text-violet-400'}`} aria-label={`Plan: ${user.plan}`}>
                            {user.plan}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-white" aria-label={`${user.credits} credits`}>{user.credits}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleCreditAdjust(user.id, 100)}
                            disabled={creditMutation.isPending}
                            className="text-xs px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                          >
                            +100 credits
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === 'builds' && (
            <section id="builds-panel" role="tabpanel" aria-labelledby="builds-tab">
              <h1 className="text-2xl font-bold text-white mb-6">Recent Builds</h1>
              <div className="bg-forge-surface border border-forge-border rounded-xl overflow-hidden">
                <table className="w-full" role="table" aria-label="Builds table">
                  <thead className="border-b border-forge-border">
                    <tr className="text-left" role="row">
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">ID</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Status</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Credits</th>
                      <th className="px-6 py-4 text-sm font-medium text-forge-text-secondary" scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builds?.builds?.map((build: Build) => (
                      <tr key={build.id} className="border-b border-forge-border last:border-0" role="row">
                        <td className="px-6 py-4 text-sm font-mono text-white">{build.id.slice(0, 8)}...</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`capitalize ${
                            build.status === 'success' ? 'text-emerald-400' :
                            build.status === 'failed' ? 'text-red-400' : 'text-amber-400'
                          }`} aria-label={`Status: ${build.status}`}>
                            {build.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-white" aria-label={`${build.credits_used} credits used`}>{build.credits_used}</td>
                        <td className="px-6 py-4 text-sm text-forge-text-secondary">
                          {new Date(build.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}