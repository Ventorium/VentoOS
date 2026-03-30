export { useWindowStore } from './store'
export {
  openWindow,
  closeWindow,
  focusWindow,
  minimizeWindow,
  restoreWindow,
  toggleMaximize,
  closeAllWindows,
} from './manager'
export { useWindow, useWindowList, useFocusedWindow, useAppWindows, useWindowActions } from './hooks'
export type { WindowInstance, WindowOpenOptions } from './types'
