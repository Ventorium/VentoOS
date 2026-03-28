/**
 * OS Process Manager Store
 *
 * Treats each window as a system process with lifecycle and resource tracking.
 * Enables memory optimization by suspending dormant processes.
 *
 * Process lifecycle:
 *   spawn → running → background / suspended → terminated
 */
import { create } from 'zustand'

export type ProcessStatus = 'running' | 'background' | 'suspended' | 'crashed'
export type ProcessPriority = 'high' | 'normal' | 'low'

export interface OSProcess {
  /** Matches window ID */
  id: string
  appId: string
  /** Monotonically increasing numeric process ID */
  pid: number
  status: ProcessStatus
  priority: ProcessPriority
  /** Estimated memory in MB (simulated based on app type) */
  memoryMb: number
  /** Whether the process is actively using CPU */
  cpuActive: boolean
  startedAt: number
  lastActiveAt: number
  /** When it was last suspended (for dormancy checks) */
  suspendedAt?: number
}

// Memory footprint estimates per app category
const APP_MEMORY_MAP: Record<string, number> = {
  kubernetes: 180,
  database: 120,
  redis: 80,
  explorer: 100,
  'ai-assistant': 200,
  settings: 60
}

let pidCounter = 100

interface ProcessStore {
  processes: Record<string, OSProcess>

  /** Spawn a new process for a window */
  spawn: (windowId: string, appId: string) => void
  /** Terminate a process when its window closes */
  terminate: (windowId: string) => void
  /** Mark a process as actively running (foreground) */
  activate: (windowId: string) => void
  /** Move a process to background */
  toBackground: (windowId: string) => void
  /** Suspend a process (minimized + idle) */
  suspend: (windowId: string) => void
  /** Mark a process as crashed */
  crash: (windowId: string) => void

  getProcess: (windowId: string) => OSProcess | undefined
  getAllProcesses: () => OSProcess[]
  /** Total estimated memory in MB */
  getTotalMemoryMb: () => number
  /** Check if a process content should be rendered (not suspended) */
  shouldRender: (windowId: string) => boolean
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: {},

  spawn(windowId, appId) {
    const process: OSProcess = {
      id: windowId,
      appId,
      pid: ++pidCounter,
      status: 'running',
      priority: 'normal',
      memoryMb: APP_MEMORY_MAP[appId] ?? 80,
      cpuActive: true,
      startedAt: Date.now(),
      lastActiveAt: Date.now()
    }
    set(state => ({ processes: { ...state.processes, [windowId]: process } }))
  },

  terminate(windowId) {
    set(state => {
      const next = { ...state.processes }
      delete next[windowId]
      return { processes: next }
    })
  },

  activate(windowId) {
    set(state => ({
      processes: {
        ...state.processes,
        [windowId]: {
          ...state.processes[windowId],
          status: 'running',
          cpuActive: true,
          lastActiveAt: Date.now(),
          suspendedAt: undefined
        }
      }
    }))
  },

  toBackground(windowId) {
    set(state => {
      const p = state.processes[windowId]
      if (!p) return state
      return {
        processes: {
          ...state.processes,
          [windowId]: { ...p, status: 'background', cpuActive: false }
        }
      }
    })
  },

  suspend(windowId) {
    set(state => {
      const p = state.processes[windowId]
      if (!p) return state
      return {
        processes: {
          ...state.processes,
          [windowId]: {
            ...p,
            status: 'suspended',
            cpuActive: false,
            suspendedAt: Date.now()
          }
        }
      }
    })
  },

  crash(windowId) {
    set(state => {
      const p = state.processes[windowId]
      if (!p) return state
      return {
        processes: {
          ...state.processes,
          [windowId]: { ...p, status: 'crashed', cpuActive: false }
        }
      }
    })
  },

  getProcess(windowId) {
    return get().processes[windowId]
  },

  getAllProcesses() {
    return Object.values(get().processes)
  },

  getTotalMemoryMb() {
    return Object.values(get().processes).reduce((sum, p) => sum + p.memoryMb, 0)
  },

  /** Suspended processes with content older than 60s are not rendered */
  shouldRender(windowId) {
    const p = get().processes[windowId]
    if (!p) return true
    if (p.status === 'suspended' && p.suspendedAt) {
      return Date.now() - p.suspendedAt < 60_000
    }
    return true
  }
}))
