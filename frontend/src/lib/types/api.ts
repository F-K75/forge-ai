export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  plan: 'free' | 'standard' | 'pro' | 'enterprise'
  credits: number
  created_at: string
  is_admin?: boolean
}

export interface Project {
  id: string
  name: string
  description?: string
}

export interface Build {
  id: string
  status: string
  credits_used: number
  created_at: string
}

export interface AnalyticsOverview {
  total_users: number
  total_builds: number
  total_revenue: number
  active_subscriptions: number
}

export interface Deployment {
  id: string
  build_id: string
  project_id: string
  status: string
  url?: string
}