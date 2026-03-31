/**
 * Task Store
 *
 * In-memory task state. Tasks have a lifecycle: queued → running → success/failed/cancelled.
 */

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

  _addTask: (task: TaskItem) => void
  _updateTask: (id: string, updates: Partial<TaskItem>) => void
  _removeTask: (id: string) => void

  clearCompleted: () => void
  togglePanel: () => void
  setPanel: (open: boolean) => void

  getActiveTasks: () => TaskItem[]
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  panelOpen: false,

  _addTask(task) {
    set(s => ({ tasks: [task, ...s.tasks] }))
  },

  _updateTask(id, updates) {
    set(s => ({
      tasks: s.tasks.map(t => (t.id === id ? { ...t, ...updates } : t))
    }))
  },

  _removeTask(id) {
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
