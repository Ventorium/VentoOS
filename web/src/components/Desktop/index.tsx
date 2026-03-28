/**
 * Desktop — Background layer with right-click context menu
 */
import { useContextMenu } from '@/store/contextMenu'
import { useDesktopStore } from '@/store/desktop'
import { useLaunchpadStore } from '@/store/launchpad'
import { useWindowStore } from '@/store/window'

const DEFAULT_GRADIENT = 'linear-gradient(145deg, #0d1117 0%, #161b27 30%, #1a2035 60%, #0f1a2e 100%)'

export default function Desktop() {
  const wallpaper = useDesktopStore(s => s.wallpaper)
  const windows = useWindowStore(s => s.windows)
  const { toggle: openLaunchpad } = useLaunchpadStore()

  const handleDesktopClick = () => {
    const focused = windows.find(w => w.isFocused)
    if (focused) {
      useWindowStore.setState({ windows: windows.map(w => ({ ...w, isFocused: false })) })
    }
  }

  const onContextMenu = useContextMenu(() => [
    { id: 'launchpad', label: '启动台', action: openLaunchpad },
    { type: 'separator' },
    { id: 'new-folder', label: '新建文件夹', disabled: true },
    { id: 'get-info', label: '显示简介', disabled: true },
    { type: 'separator' },
    {
      id: 'change-wallpaper',
      label: '更换桌面背景',
      action: () => {
        // Open settings app to wallpaper section
        useWindowStore.getState().openWindow('settings', '系统设置')
      }
    },
    { type: 'separator' },
    { id: 'about', label: '关于 VentoOS', action: () => {} }
  ])

  return (
    <div
      role="presentation"
      className="absolute inset-0"
      style={{
        backgroundImage: wallpaper.startsWith('linear-') || wallpaper.startsWith('radial-')
          ? wallpaper
          : `url(${wallpaper}), ${DEFAULT_GRADIENT}`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: 0
      }}
      onClick={handleDesktopClick}
      onContextMenu={onContextMenu}
    />
  )
}
