/**
 * Dock Position Registry
 *
 * Tracks the bounding rects of Dock icons so that the Window minimize
 * animation can target the correct icon position.
 */
import { create } from 'zustand'

interface DockRect {
  x: number
  y: number
  width: number
  height: number
}

interface DockPositionStore {
  /** Map of appId → bounding rect of the Dock icon */
  iconRects: Map<string, DockRect>
  /** Rect of the minimized-thumbnails area */
  thumbnailAreaRect: DockRect | null

  registerIconRect: (appId: string, rect: DockRect) => void
  unregisterIconRect: (appId: string) => void
  setThumbnailAreaRect: (rect: DockRect | null) => void
  getTargetRect: (appId: string) => DockRect | null
}

export const useDockPositionStore = create<DockPositionStore>((set, get) => ({
  iconRects: new Map(),
  thumbnailAreaRect: null,

  registerIconRect(appId, rect) {
    set(s => {
      const next = new Map(s.iconRects)
      next.set(appId, rect)
      return { iconRects: next }
    })
  },

  unregisterIconRect(appId) {
    set(s => {
      const next = new Map(s.iconRects)
      next.delete(appId)
      return { iconRects: next }
    })
  },

  setThumbnailAreaRect(rect) {
    set({ thumbnailAreaRect: rect })
  },

  getTargetRect(appId) {
    return get().iconRects.get(appId) ?? get().thumbnailAreaRect
  },
}))
