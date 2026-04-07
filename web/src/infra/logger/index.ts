/**
 * Logger
 *
 * Unified console logger with level control.
 * In production, only warnings and errors are emitted.
 * All warn/error entries (and info+ in dev) are also pushed to the LogStore
 * for display in the Log Center app.
 */

import type { LogLevel } from './store'
import { useLogStore } from './store'

export type { LogLevel, LogEntry } from './store'
export { useLogStore } from './store'

const isDev = import.meta.env.DEV

function log(level: LogLevel, module: string, ...args: unknown[]): void {
  if (!isDev && level === 'debug') return

  const prefix = `[${module}]`
  switch (level) {
    case 'debug':
      console.debug(prefix, ...args)
      break
    case 'info':
      console.info(prefix, ...args)
      break
    case 'warn':
      console.warn(prefix, ...args)
      break
    case 'error':
      console.error(prefix, ...args)
      break
  }

  // Push to in-memory log store for the Log Center app.
  // Stringify the first arg as message, rest as details.
  const message = args.length > 0 ? String(args[0]) : ''
  const details = args.length > 1 ? args.slice(1) : undefined
  useLogStore.getState().push(level, module, message, details)
}

/**
 * Create a scoped logger for a module.
 *
 * @example
 * const logger = createLogger('kernel/window')
 * logger.info('Window opened', { windowId })
 */
export function createLogger(module: string) {
  return {
    debug: (...args: unknown[]) => log('debug', module, ...args),
    info: (...args: unknown[]) => log('info', module, ...args),
    warn: (...args: unknown[]) => log('warn', module, ...args),
    error: (...args: unknown[]) => log('error', module, ...args)
  }
}
