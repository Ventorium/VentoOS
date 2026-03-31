/**
 * Task Service
 *
 * Create and track async tasks. Listens to WebSocket for backend task updates.
 */

import { createLogger } from '@/infra/logger'
import type { TaskUpdatePayload } from '@/infra/ws'
import { wsClient } from '@/infra/ws'
import { systemChannel } from '@/kernel/channel'
import type { TaskItem } from './store'
import { useTaskStore } from './store'

const logger = createLogger('services/task')

let _taskCounter = 0

export const taskService = {
  /**
   * Create a new task and add it to the local store.
   * Returns the task ID.
   */
  createTask(t: Omit<TaskItem, 'id' | 'status' | 'createdAt'>, opts?: { runImmediately?: boolean }): string {
    const id = `task-${Date.now()}-${++_taskCounter}`
    const item: TaskItem = {
      ...t,
      id,
      status: opts?.runImmediately ? 'running' : 'queued',
      createdAt: Date.now(),
      startedAt: opts?.runImmediately ? Date.now() : undefined
    }
    useTaskStore.getState()._addTask(item)
    logger.debug('Task created', { id, name: t.name })
    return id
  },

  /** Update a task's status and optional progress. */
  updateTask(id: string, status: TaskItem['status'], progress?: number): void {
    const now = Date.now()
    const updates: Partial<TaskItem> = {
      status,
      ...(progress !== undefined ? { progress } : {}),
      ...(status === 'running' ? { startedAt: now } : {}),
      ...(['success', 'failed', 'cancelled'].includes(status) ? { completedAt: now } : {})
    }
    useTaskStore.getState()._updateTask(id, updates)

    if (status === 'success' || status === 'failed') {
      systemChannel.notify('task:completed', { taskId: id, success: status === 'success' })
    }
  },

  /** Update task progress (0–100). */
  updateProgress(id: string, progress: number): void {
    useTaskStore.getState()._updateTask(id, { progress })
  },

  /** Remove a task from the store. */
  removeTask(id: string): void {
    useTaskStore.getState()._removeTask(id)
  },

  /**
   * Start listening to task update events from the backend WebSocket.
   * Returns cleanup function.
   */
  listenToTaskUpdates(): () => void {
    return wsClient.on('TaskUpdate', (data: TaskUpdatePayload) => {
      useTaskStore.getState()._updateTask(data.id, {
        status: data.status,
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
        ...(['success', 'failed', 'cancelled'].includes(data.status) ? { completedAt: Date.now() } : {})
      })

      if (data.status === 'success' || data.status === 'failed') {
        systemChannel.notify('task:completed', {
          taskId: data.id,
          success: data.status === 'success'
        })
      }
    })
  }
}
