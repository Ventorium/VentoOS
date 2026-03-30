/**
 * Keyboard Shortcut Store
 *
 * Global keyboard shortcut registry.
 */

import { useEffect } from 'react'
import { create } from 'zustand'

export interface Shortcut {
  id: string
  /** Combo string, e.g. "cmd+k", "ctrl+shift+h", "escape" */
  combo: string
  description: string
  handler: () => void
  /** Prevent default browser behavior (default: true) */
  preventDefault?: boolean
}

function parseCombo(combo: string): {
  key: string
  meta: boolean
  ctrl: boolean
  shift: boolean
  alt: boolean
} {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  return {
    key,
    meta: parts.includes('cmd') || parts.includes('meta'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
  }
}

function matchesEvent(combo: string, e: KeyboardEvent): boolean {
  const { key, meta, ctrl, shift, alt } = parseCombo(combo)
  return (
    e.key.toLowerCase() === key &&
    e.metaKey === meta &&
    e.ctrlKey === ctrl &&
    e.shiftKey === shift &&
    e.altKey === alt
  )
}

interface KeyboardStore {
  shortcuts: Record<string, Shortcut>

  register: (shortcut: Shortcut) => void
  unregister: (id: string) => void
  handleKeyDown: (e: KeyboardEvent) => void
}

export const useKeyboardStore = create<KeyboardStore>((set, get) => ({
  shortcuts: {},

  register(shortcut) {
    set(state => ({ shortcuts: { ...state.shortcuts, [shortcut.id]: shortcut } }))
  },

  unregister(id) {
    set(state => {
      const next = { ...state.shortcuts }
      delete next[id]
      return { shortcuts: next }
    })
  },

  handleKeyDown(e) {
    for (const shortcut of Object.values(get().shortcuts)) {
      if (matchesEvent(shortcut.combo, e)) {
        if (shortcut.preventDefault !== false) e.preventDefault()
        shortcut.handler()
        return
      }
    }
  },
}))

/**
 * React hook to register a keyboard shortcut for the lifetime of a component.
 */
export function useShortcut(
  id: string,
  combo: string,
  description: string,
  handler: () => void,
  deps?: React.DependencyList,
): void {
  const { register, unregister } = useKeyboardStore()
  useEffect(() => {
    register({ id, combo, description, handler })
    return () => unregister(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? [])
}
