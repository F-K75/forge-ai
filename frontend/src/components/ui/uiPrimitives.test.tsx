import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { FolderGit2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  Input,
  Select,
  Skeleton,
  SkeletonCard,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Tabs,
  Tooltip,
} from './index'
import { applyTheme, getStoredTheme } from '../../lib/theme'
import { THEME_STORAGE_KEY } from '../../lib/designTokens'

declare module 'vitest' {
  interface Assertion<T> {
    toHaveNoViolations(): void
  }
}

const AXE_OPTIONS = {
  rules: {
    'color-contrast': { enabled: false },
  },
}

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe(container, AXE_OPTIONS)
  expect(results).toHaveNoViolations()
}

describe('Theme & UI Primitives (Phase 1)', () => {
  afterEach(() => {
    cleanup()
    localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.className = ''
  })

  it('defaults to dark mode and supports light and high-contrast modes', () => {
    expect(getStoredTheme()).toBe('dark')

    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    applyTheme('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    applyTheme('high-contrast')
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('renders Button variants, loading, and disabled states accessibly', async () => {
    const { container } = render(
      <div className="flex gap-2">
        <Button variant="primary">Deploy</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">More</Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
      </div>
    )
    const savingBtn = screen.getByRole('button', { name: 'Saving' })
    expect(savingBtn).toBeDisabled()
    expect(savingBtn).toHaveAttribute('aria-busy', 'true')
    await expectNoAxeViolations(container)
  })

  it('renders Card, Badge, Skeleton, and Tooltip accessibly', async () => {
    const { container } = render(
      <div>
        <Card variant="content" hoverable>
          <Badge variant="accent" dot>Active</Badge>
          <Tooltip content="Build status">
            <span>Status</span>
          </Tooltip>
          <Skeleton className="h-4 w-24" />
          <SkeletonCard count={1} />
        </Card>
      </div>
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('Build status')
    await expectNoAxeViolations(container)
  })

  it('renders Input and Select with label, hint, error, and disabled states', async () => {
    const { container } = render(
      <form>
        <Input id="repo-url" name="repo" label="Repository URL" hint="HTTPS or SSH" />
        <Input id="api-key" name="apiKey" label="API Key" error="Invalid key format" />
        <Select id="region" name="region" label="Region">
          <option value="us-east">US East</option>
          <option value="eu-west">EU West</option>
        </Select>
      </form>
    )
    expect(screen.getByLabelText('API Key')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid key format')
    await expectNoAxeViolations(container)
  })

  it('renders Table with headers, rows, loading, and empty states', async () => {
    const { container } = render(
      <div>
        <Table striped>
          <TableHeader>
            <TableRow>
              <TableCell header>Service</TableCell>
              <TableCell header>Latency</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>API Gateway</TableCell>
              <TableCell>12ms</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Table aria-label="Empty builds" empty emptyContent={<span>No builds yet</span>} loadingCols={2} />
      </div>
    )
    expect(screen.getByText('No builds yet')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('renders Tabs and Switch accessibly', async () => {
    const onTabChange = vi.fn()
    const { container } = render(
      <div>
        <Tabs
          value="overview"
          onChange={onTabChange}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'logs', label: 'Logs' },
          ]}
        />
        <Switch label="Auto-deploy" description="Deploy on push to main" checked onChange={vi.fn()} />
      </div>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Logs' }))
    expect(onTabChange).toHaveBeenCalledWith('logs')
    await expectNoAxeViolations(container)
  })

  it('renders Dialog and Drawer with Escape key handling and zero axe violations', async () => {
    const onDialogClose = vi.fn()
    const onDrawerClose = vi.fn()
    const { container } = render(
      <div>
        <Dialog open onOpenChange={onDialogClose} title="Confirm Action" description="Are you sure?">
          <p>Proceed with deployment.</p>
        </Dialog>
        <Drawer open onOpenChange={onDrawerClose} title="Inspector">
          <p>Details panel</p>
        </Drawer>
        <EmptyState
          icon={FolderGit2}
          title="No repositories"
          description="Import a repository to get started."
          primaryAction={{ label: 'Import Repo', onClick: vi.fn() }}
        />
      </div>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDialogClose).toHaveBeenCalledTimes(1)
    expect(onDrawerClose).toHaveBeenCalledTimes(1)
    await expectNoAxeViolations(container)
  })
})

