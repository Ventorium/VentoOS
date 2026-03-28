import CommandPalette from '@/components/CommandPalette'
import ContextMenu from '@/components/ContextMenu'
import Desktop from '@/components/Desktop'
import Dock from '@/components/Dock'
import Launchpad from '@/components/Launchpad'
import NotificationCenter from '@/components/NotificationCenter'
import NotificationToast from '@/components/NotificationToast'
import TaskCenter from '@/components/TaskCenter'
import TopBar from '@/components/TopBar'
import WindowManager from '@/components/WindowManager'
import { useThemeSync } from '@/hooks/useTheme'

function App() {
  useThemeSync()

  return (
    <div className="vos-shell">
      <Desktop />
      <TopBar />
      <WindowManager />
      <Dock />
      <NotificationCenter />
      <TaskCenter />
      <CommandPalette />
      {/* OS-level portals — rendered above everything else */}
      <ContextMenu />
      <Launchpad />
      <NotificationToast />
    </div>
  )
}

export default App
