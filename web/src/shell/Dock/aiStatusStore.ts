/**
 * AI Status Store
 *
 * Tracks the current AI assistant status for Dock icon animation.
 */
import { create } from 'zustand'

export type AIStatus = 'idle' | 'thinking' | 'executing' | 'error'

interface AIStatusStore {
  status: AIStatus
  setStatus: (status: AIStatus) => void
}

export const useAIStatusStore = create<AIStatusStore>(set => ({
  status: 'idle',
  setStatus: status => set({ status })
}))
