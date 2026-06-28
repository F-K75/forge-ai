import { useAuthStore } from './authStore'

export const useAuthUser = () => useAuthStore(state => state.user)
export const useIsAuthenticated = () => useAuthStore(state => state.isAuthenticated)
export const useAuthLoading = () => useAuthStore(state => state.isLoading)
export const useDemoMode = () => useAuthStore(state => state.demoMode)
export const useLogin = () => useAuthStore(state => state.login)
export const useRegister = () => useAuthStore(state => state.register)
export const useLogout = () => useAuthStore(state => state.logout)
export const useFetchMe = () => useAuthStore(state => state.fetchMe)