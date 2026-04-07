/**
 * VFS Clipboard Store
 *
 * Global Zustand store for virtual filesystem copy/cut/paste operations.
 */

import { create } from 'zustand'
import type { VfsNode } from '@/apps/explorer/api'

export interface VfsClipboard {
  items: Array<{ mountId: string; node: VfsNode }>
  operation: 'copy' | 'cut'
}

interface VfsClipboardStore {
  clipboard: VfsClipboard | null
  setClipboard: (clipboard: VfsClipboard) => void
  clearClipboard: () => void
}

export const useVfsClipboardStore = create<VfsClipboardStore>(set => ({
  clipboard: null,
  setClipboard(clipboard) {
    set({ clipboard })
  },
  clearClipboard() {
    set({ clipboard: null })
  }
}))
