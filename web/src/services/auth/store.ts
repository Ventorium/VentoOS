/**
 * Auth Store
 *
 * Persisted authentication state: token, initialization status, lock state.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthStore {
  token: string | null
  initialized: boolean
  locked: boolean

  setToken: (token: string | null) => void
  setInitialized: (v: boolean) => void
  lock: () => void
  unlock: (token: string) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    set => ({
      token: null,
      initialized: false,
      locked: true,

      setToken(token) {
        set({ token, locked: token === null })
      },

      setInitialized(v) {
        set({ initialized: v })
      },

      lock() {
        set({ locked: true, token: null })
      },

      unlock(token) {
        set({ locked: false, token })
      },
    }),
    {
      name: 'ventoos-auth',
      partialize: state => ({ token: state.token, initialized: state.initialized }),
    },
  ),
)
