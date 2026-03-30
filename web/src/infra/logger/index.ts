/**
 * Logger
 *
 * Unified console logger with level control.
 * In production, only warnings and errors are emitted.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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
