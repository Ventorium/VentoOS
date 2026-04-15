import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { AppLayout, AppSidebar } from '@/components'
import {
  DEFAULT_BOTTOM_HEIGHT,
  DEFAULT_DRAWER_WIDTH,
  MAX_DRAWER_WIDTH_PCT,
  MIN_BOTTOM_HEIGHT,
  MIN_DRAWER_WIDTH,
  TAB_BAR_HEIGHT,
} from '../../constants'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import { BottomPanel } from './BottomPanel'
import { DetailDrawer } from './DetailDrawer'
import { K8sSidebar } from './K8sSidebar'
import { K8sTabBar } from './K8sTabBar'

interface Props {
  children: ReactNode
  overlay?: ReactNode
  onAddCluster?: () => void
}

export function K8sLayout({ children, overlay, onAddCluster }: Props) {
  const detailOpen = useKubernetesStore(s => s.detailOpen)
  const detailWidth = useKubernetesStore(s => s.detailWidth)
  const setDetailWidth = useKubernetesStore(s => s.setDetailWidth)
  const bottomPanelOpen = useKubernetesStore(s => s.bottomPanelOpen)
  const bottomPanelHeight = useKubernetesStore(s => s.bottomPanelHeight)
  const setBottomPanelHeight = useKubernetesStore(s => s.setBottomPanelHeight)

  const drawerResizingRef = useRef(false)
  const drawerStartXRef = useRef(0)
  const drawerStartWRef = useRef(0)

  const bottomResizingRef = useRef(false)
  const bottomStartYRef = useRef(0)
  const bottomStartHRef = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (drawerResizingRef.current) {
        const delta = drawerStartXRef.current - e.clientX
        const nextW = drawerStartWRef.current + delta
        const maxW = window.innerWidth * MAX_DRAWER_WIDTH_PCT
        const clamped = Math.max(MIN_DRAWER_WIDTH, Math.min(maxW, nextW))
        setDetailWidth(clamped)
      }
      if (bottomResizingRef.current) {
        const delta = e.clientY - bottomStartYRef.current
        const nextH = bottomStartHRef.current - delta
        const clamped = Math.max(MIN_BOTTOM_HEIGHT, nextH)
        setBottomPanelHeight(clamped)
      }
    }
    const handleMouseUp = () => {
      drawerResizingRef.current = false
      bottomResizingRef.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setDetailWidth, setBottomPanelHeight])

  const startDrawerResize = (e: React.MouseEvent) => {
    e.preventDefault()
    drawerResizingRef.current = true
    drawerStartXRef.current = e.clientX
    drawerStartWRef.current = detailWidth
  }

  const startBottomResize = (e: React.MouseEvent) => {
    e.preventDefault()
    bottomResizingRef.current = true
    bottomStartYRef.current = e.clientY
    bottomStartHRef.current = bottomPanelHeight
  }

  return (
    <AppLayout
      sidebar={
        <AppSidebar width={220}>
          <K8sSidebar onAddCluster={onAddCluster} />
        </AppSidebar>
      }
      overlay={overlay}
    >
      <div className="flex flex-col w-full h-full overflow-hidden">
        <K8sTabBar />
        <div className="flex-1 flex flex-row overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 relative">
            {children}
          </div>
        </div>
        {bottomPanelOpen && (
          <>
            <div
              className="w-full h-[6px] cursor-row-resize flex items-center justify-center bg-[var(--vos-bg-surface)] border-t-[0.5px] border-t-[var(--vos-border-subtle)]"
              onMouseDown={startBottomResize}
            >
              <div className="w-8 h-[2px] rounded-full bg-[var(--vos-border-subtle)]" />
            </div>
            <div
              className="w-full border-t-[0.5px] border-t-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] flex flex-col"
              style={{ height: bottomPanelHeight }}
            >
              <BottomPanel />
            </div>
          </>
        )}
      </div>

      {detailOpen && (
        <>
          <div
            className="absolute top-0 bottom-0 cursor-ew-resize z-50"
            style={{ left: `calc(100% - ${detailWidth}px - 4px)`, width: '8px' }}
            onMouseDown={startDrawerResize}
          />
          <div
            className="absolute top-0 right-0 bottom-0 border-l-[0.5px] border-l-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] z-40 flex flex-col"
            style={{ width: detailWidth, top: TAB_BAR_HEIGHT }}
          >
            <DetailDrawer />
          </div>
        </>
      )}
    </AppLayout>
  )
}
