import { AnimatePresence, motion } from 'framer-motion'
import { Activity, CheckCircle, Clock, Loader2, X, XCircle } from 'lucide-react'
import { type TaskItem, useTaskStore } from '@/services/task'
import { tokens } from '@/theme'

const statusIcon: Record<TaskItem['status'], React.ReactNode> = {
  queued: <Clock size={14} className="text-[var(--vos-text-tertiary)]" />,
  running: <Loader2 size={14} className="animate-spin text-[var(--vos-accent-primary)]" />,
  success: <CheckCircle size={14} className="text-[var(--vos-accent-success)]" />,
  failed: <XCircle size={14} className="text-[var(--vos-accent-danger)]" />,
  cancelled: <X size={14} className="text-[var(--vos-text-tertiary)]" />
}

function TaskRow({ task }: { task: TaskItem }) {
  const removeTask = useTaskStore(s => s._removeTask)

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
      {statusIcon[task.status]}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{task.name}</div>
        {task.progress != null && task.status === 'running' && (
          <div className="mt-1 h-1 rounded-full overflow-hidden bg-[var(--vos-bg-input)]">
            <div
              className="h-full rounded-full transition-all bg-[var(--vos-accent-primary)]"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        className="vos-btn-reset flex-shrink-0 text-[var(--vos-text-tertiary)]"
        onClick={() => removeTask(task.id)}
      >
        <X size={12} />
      </button>
    </div>
  )
}

export default function TaskCenter() {
  const panelOpen = useTaskStore(s => s.panelOpen)
  const tasks = useTaskStore(s => s.tasks)
  const setPanel = useTaskStore(s => s.setPanel)
  const clearCompleted = useTaskStore(s => s.clearCompleted)

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          <div role="presentation" className="fixed inset-0 z-[2999]" onClick={() => setPanel(false)} />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="vos-glass-heavy fixed flex flex-col right-[356px] w-[320px] max-h-[calc(100vh-100px)] bg-[var(--vos-bg-overlay)] border-[0.5px] border-solid border-[var(--vos-border-default)] z-[3000] text-[var(--vos-text-primary)]"
            style={{
              top: tokens.topBar.height + 8,
              borderRadius: tokens.radius.panel,
              boxShadow: tokens.shadow.overlay
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
              <div className="flex items-center gap-2">
                <Activity size={14} />
                <span className="text-sm font-medium">Tasks</span>
              </div>
              <button
                type="button"
                className="text-[11px] bg-transparent border-none cursor-pointer text-[var(--vos-text-tertiary)]"
                onClick={clearCompleted}
              >
                Clear completed
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {tasks.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-xs text-[var(--vos-text-tertiary)]">
                  No tasks
                </div>
              ) : (
                tasks.map(t => <TaskRow key={t.id} task={t} />)
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
