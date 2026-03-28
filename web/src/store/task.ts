import { create } from 'zustand'

export interface TaskItem {
  id: string
  name: string
  description?: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress?: number
  source?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

interface TaskStore {
  tasks: TaskItem[]
  panelOpen: boolean

  addTask: (t: Omit<TaskItem, 'id' | 'status' | 'createdAt'>) => string
  updateStatus: (id: string, status: TaskItem['status']) => void
  updateProgress: (id: string, progress: number) => void
  removeTask: (id: string) => void
  clearCompleted: () => void
  togglePanel: () => void
  setPanel: (open: boolean) => void
  getActiveTasks: () => TaskItem[]
}

let taskCounter = 0

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  panelOpen: false,

  addTask(t) {
    const id = `task-${Date.now()}-${++taskCounter}`
    const item: TaskItem = {
      ...t,
      id,
      status: 'queued',
      createdAt: Date.now()
    }
    set(s => ({ tasks: [item, ...s.tasks] }))
    return id
  },

  updateStatus(id, status) {
    const now = Date.now()
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== id) return t
        return {
          ...t,
          status,
          startedAt: status === 'running' ? now : t.startedAt,
          completedAt: status === 'success' || status === 'failed' || status === 'cancelled' ? now : t.completedAt
        }
      })
    }))
  },

  updateProgress(id, progress) {
    set(s => ({
      tasks: s.tasks.map(t => (t.id === id ? { ...t, progress } : t))
    }))
  },

  removeTask(id) {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
  },

  clearCompleted() {
    set(s => ({
      tasks: s.tasks.filter(t => t.status !== 'success' && t.status !== 'failed' && t.status !== 'cancelled')
    }))
  },

  togglePanel() {
    set(s => ({ panelOpen: !s.panelOpen }))
  },

  setPanel(open) {
    set({ panelOpen: open })
  },

  getActiveTasks() {
    return get().tasks.filter(t => t.status === 'queued' || t.status === 'running')
  }
}))
