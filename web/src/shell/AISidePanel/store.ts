import { create } from 'zustand'

interface AISidePanelState {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export const useAISidePanelStore = create<AISidePanelState>((set) => ({
  isOpen: false,
  toggle: () => set(s => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
