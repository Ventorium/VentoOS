/**
 * Log Store — In-memory log buffer for the Log Center app.
 *
 * Augments the console logger: every log call also pushes an entry
 * into a bounded ring buffer that the Log Center app can read.
 */

import { create } from 'zustand'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  timestamp: number
  level: LogLevel
  module: string
  message: string
  details?: unknown[]
}

const MAX_ENTRIES = 2000

let nextId = 1

interface LogStore {
  entries: LogEntry[]
  /** Push a new log entry. Trims oldest when exceeding MAX_ENTRIES. */
  push: (level: LogLevel, module: string, message: string, details?: unknown[]) => void
  /** Clear all entries. */
  clear: () => void
}

export const useLogStore = create<LogStore>((set) => ({
  entries: [],

  push: (level, module, message, details) => {
    const entry: LogEntry = {
      id: nextId++,
      timestamp: Date.now(),
      level,
      module,
      message,
      details,
    }
    set((state) => {
      const next = [...state.entries, entry]
      return { entries: next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next }
    })
  },

  clear: () => set({ entries: [] }),
}))
