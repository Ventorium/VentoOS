/**
 * WindowManager — Renders all open windows
 *
 * Optimization: Each window's content is lazy-loaded.
 * Virtual rendering is handled inside <Window> via the process store.
 */
import { AnimatePresence } from 'framer-motion'
import { getAppComponent, useWindowStore } from '@/kernel'
import Window from '@/shell/Window'

export default function WindowManager() {
  const windows = useWindowStore(s => s.windows)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 100
      }}
    >
      <AnimatePresence>
        {windows.map(win => {
          const AppComponent = getAppComponent(win.appId)

          return (
            <Window key={win.id} win={win}>
              {AppComponent ? (
                <AppComponent windowId={win.id} processId={win.processId ?? 0} initialAppState={win.appState} />
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--vos-text-tertiary)',
                    fontSize: 13
                  }}
                >
                  未找到应用: {win.appId}
                </div>
              )}
            </Window>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
