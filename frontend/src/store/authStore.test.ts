import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './authStore'

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true })
  })

  it('starts unauthenticated and loading', () => {
    const s = useAuthStore.getState()
    expect(s.user).toBeNull()
    expect(s.isAuthenticated).toBe(false)
    expect(s.isLoading).toBe(true)
  })

  it('login (demo mode) sets a demo user and authenticates', async () => {
    await useAuthStore.getState().login('dev@forge.dev', 'pw')
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.user?.email).toBe('dev@forge.dev')
    expect(s.isLoading).toBe(false)
  })

  it('logout clears the session', async () => {
    await useAuthStore.getState().login('dev@forge.dev', 'pw')
    await useAuthStore.getState().logout()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.user).toBeNull()
  })

  it('register (demo mode) creates and authenticates a new demo user', async () => {
    await useAuthStore.getState().register('new@forge.dev', 'New User', 'pw')
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.user?.email).toBe('new@forge.dev')
    expect(s.user?.name).toBe('New User')
  })
})
