import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  reviewsApi,
  reviewSocketUrl,
  isOrchestratorConfigured,
  ORCHESTRATOR_URL,
  orchestratorApi,
} from './orchestratorApi'

describe('orchestratorApi when unconfigured (default)', () => {
  it('identifies unconfigured state when VITE_ORCHESTRATOR_URL is unset', () => {
    expect(isOrchestratorConfigured).toBe(false)
    expect(ORCHESTRATOR_URL).toBeNull()
    expect(reviewsApi.isConfigured()).toBe(false)
  })

  it('returns null for reviewSocketUrl when unconfigured', () => {
    expect(reviewSocketUrl('run-test-123')).toBeNull()
  })

  it('rejects reviewsApi.list without network hit when unconfigured', async () => {
    await expect(reviewsApi.list()).rejects.toThrow(
      /Review Board orchestrator service is not configured/
    )
  })

  it('rejects reviewsApi.get without network hit when unconfigured', async () => {
    await expect(reviewsApi.get('run-test-123')).rejects.toThrow(
      /Review Board orchestrator service is not configured/
    )
  })

  it('rejects reviewsApi.create without network hit when unconfigured', async () => {
    await expect(
      reviewsApi.create({ repo_path: '/repo', mode: 'full' })
    ).rejects.toThrow(/Review Board orchestrator service is not configured/)
  })

  it('rejects reviewsApi.backlog without network hit when unconfigured', async () => {
    await expect(reviewsApi.backlog('run-test-123')).rejects.toThrow(
      /Review Board orchestrator service is not configured/
    )
  })

  it('rejects raw orchestratorApi requests via request interceptor', async () => {
    await expect(orchestratorApi.get('/any-endpoint')).rejects.toThrow(
      /Review Board orchestrator service is not configured/
    )
  })
})
