import { PanelsTopLeft, FolderKanban, Store, Bot, Workflow, FileCode2, MonitorPlay, CreditCard, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface SidebarItemData {
  label: string
  icon: LucideIcon
  to: string
}

export const WORKSPACE_SIDEBAR_ITEMS: SidebarItemData[] = [
  { label: 'Workspace', icon: PanelsTopLeft, to: '/' },
  { label: 'Projects', icon: FolderKanban, to: '/' },
  { label: 'Marketplace', icon: Store, to: '/marketplace' },
  { label: 'Agents', icon: Bot, to: '/' },
  { label: 'Tasks', icon: Workflow, to: '/' },
  { label: 'Files', icon: FileCode2, to: '/' },
  { label: 'Deployments', icon: MonitorPlay, to: '/' },
  { label: 'Billing', icon: CreditCard, to: '/billing' },
  { label: 'Settings', icon: Settings, to: '/settings' },
]