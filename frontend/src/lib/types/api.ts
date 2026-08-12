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

export interface PMInitiative {
  id: string
  user_id: string
  org_id?: string
  name: string
  status: string
  vision?: string
  business_goals?: string[]
  product_scope?: string
  functional_requirements?: string[]
  non_functional_requirements?: string[]
  success_metrics?: string[]
  roadmap?: Array<Record<string, unknown>>
  tech_stack?: string[]
  risks?: Array<Record<string, unknown>>
  estimated_timeline?: string
  project_ids?: string[]
  generation_error?: string | null
  version: number
  created_at?: string
  updated_at?: string
}

export interface PMPRD {
  id: string
  initiative_id: string
  executive_summary?: string
  problem_statement?: string
  solution?: string
  personas?: Array<Record<string, unknown>>
  user_journeys?: Array<Record<string, unknown>>
  functional_requirements?: string[]
  non_functional_requirements?: string[]
  security?: string
  performance?: string
  scalability?: string
  api_overview?: string
  database_overview?: string
  release_plan?: string
  version: number
  created_at?: string
  updated_at?: string
}

export interface PMEpic {
  id: string
  initiative_id: string
  title: string
  description?: string
  priority?: string
  story_points?: number
  estimated_duration?: string
  owner?: string
  status?: string
  order?: number
  created_at?: string
  updated_at?: string
}

export interface PMStory {
  id: string
  epic_id: string
  initiative_id: string
  title: string
  description?: string
  acceptance_criteria?: string[]
  definition_of_done?: string[]
  priority?: string
  story_points?: number
  business_value?: string
  risk?: string
  status?: string
  order?: number
  created_at?: string
  updated_at?: string
}

export interface PMTask {
  id: string
  story_id: string
  epic_id: string
  initiative_id: string
  title: string
  description?: string
  status?: string
  assigned_agent?: string
  estimated_hours?: number
  priority?: string
  category?: string
  kanban_order?: number
  sprint_id?: string
  created_at?: string
  updated_at?: string
  started_at?: string
  completed_at?: string
  github?: Record<string, unknown>
  generated_files?: string[]
  dependencies?: string[]
  labels?: string[]
}

export interface PMSprint {
  id: string
  initiative_id: string
  sprint_number: number
  name?: string
  goal?: string
  start_date?: string
  end_date?: string
  task_ids?: string[]
  capacity?: number
  velocity?: number
  story_points_planned?: number
  story_points_completed?: number
  completion_probability?: number
  status?: string
  created_at?: string
  updated_at?: string
}

export interface PMExecution {
  id: string
  task_id: string
  initiative_id: string
  agent?: string
  status?: string
  progress?: number
  cost_usd?: number
  tokens_used?: number
  started_at?: string
  completed_at?: string
  duration_seconds?: number
  error?: string | null
  current_thought?: string
  logs?: string[]
  generated_files?: string[]
  created_at?: string
}