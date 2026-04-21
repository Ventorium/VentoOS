import { Plus, X } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

export interface TabItemData {
  id: string
  label?: string
  closable?: boolean
}

export interface TabsProps<T extends TabItemData = TabItemData> {
  /** Tab items */
  tabs: T[]
  /** Currently active tab id */
  activeTabId: string | null
  /** Called when a tab is activated */
  onActivate: (tabId: string) => void
  /** Called when a tab close button is clicked */
  onClose?: (tabId: string) => void
  /** Called on tab double-click */
  onDoubleClick?: (tabId: string) => void
  /** Called on auxiliary (middle) mouse button click */
  onAuxClick?: (e: MouseEvent, tabId: string) => void
  /** Render custom prefix (e.g. icon) before tab label */
  renderPrefix?: (tab: T, isActive: boolean) => ReactNode
  /** Render custom suffix (e.g. dirty indicator) before close button */
  renderSuffix?: (tab: T, isActive: boolean) => ReactNode
  /** Render full custom tab content; when provided, label is not rendered */
  renderContent?: (tab: T, isActive: boolean) => ReactNode
  /** Visual variant */
  variant?: 'default' | 'compact' | 'dark' | 'underline' | 'pill'
  /** Tab layout direction */
  orientation?: 'horizontal' | 'vertical'
  /** Show the add (+) button at the end */
  showAddButton?: boolean
  /** Called when add button is clicked */
  onAdd?: () => void
  /** Title for add button tooltip */
  addButtonTitle?: string
  /** Title for close button tooltip */
  closeButtonTitle?: string
  /** When true, close button is always visible instead of hover-only. Can also be a per-tab predicate. */
  closeButtonAlwaysVisible?: boolean | ((tab: T) => boolean)
  /** Custom container className */
  className?: string
  /** When true, tabs stretch to fill the container width (flex-1) */
  block?: boolean
}

const VARIANT_STYLES = {
  horizontal: {
    default: {
      container:
        'flex items-center flex-shrink-0 overflow-x-auto h-[35px] min-h-[35px] border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]',
      tab: 'flex items-center gap-1.5 px-3 h-full flex-shrink-0 cursor-pointer text-xs group border-r-[0.5px] border-r-[var(--vos-border-subtle)] min-w-[80px] max-w-[200px] select-none',
      active: {
        background: 'var(--vos-bg-window)',
        color: 'var(--vos-text-primary)',
        borderBottom: '1px solid var(--vos-accent-primary)'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-tertiary)',
        borderBottom: '1px solid transparent'
      },
      closeBtn:
        'flex-shrink-0 w-4 h-4 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-inherit',
      addBtn:
        'flex-shrink-0 px-2 h-full flex items-center text-[var(--vos-text-tertiary)] bg-transparent border-none cursor-pointer'
    },
    compact: {
      container:
        'flex items-center flex-shrink-0 overflow-x-auto h-7 min-h-7 border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]',
      tab: 'flex items-center gap-1.5 px-2 h-full flex-shrink-0 cursor-pointer text-[11px] group border-r-[0.5px] border-r-[var(--vos-border-subtle)] min-w-[80px] max-w-[200px] select-none',
      active: {
        background: 'var(--vos-bg-window)',
        color: 'var(--vos-text-primary)',
        borderBottom: '1px solid var(--vos-accent-primary)'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-tertiary)',
        borderBottom: '1px solid transparent'
      },
      closeBtn:
        'flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-inherit',
      addBtn:
        'flex-shrink-0 px-2 h-full flex items-center text-[var(--vos-text-tertiary)] bg-transparent border-none cursor-pointer'
    },
    dark: {
      container: 'flex items-center flex-shrink-0 overflow-x-auto h-8 min-h-8 border-b border-b-[#333]',
      tab: 'group flex items-center gap-1 px-3 h-full cursor-pointer text-xs select-none flex-shrink-0 border-r border-r-[#333] max-w-[160px]',
      active: {
        background: '#0d0d0d',
        color: '#d4d4d4',
        borderBottom: '1px solid transparent'
      },
      inactive: {
        background: 'transparent',
        color: '#888',
        borderBottom: '1px solid transparent'
      },
      closeBtn: 'bg-transparent border-none cursor-pointer p-0 text-[#888] leading-[0] shrink-0',
      addBtn: 'bg-transparent border-none cursor-pointer px-2 h-full flex items-center text-[#888]'
    },
    underline: {
      container:
        'flex items-center flex-shrink-0 border-b-[1px] border-b-[var(--vos-border-subtle)]',
      tab: 'flex items-center gap-1 px-3 py-2 text-[11px] relative cursor-pointer border-none select-none',
      active: {
        color: 'var(--vos-text-primary)'
      },
      inactive: {
        color: 'var(--vos-text-tertiary)'
      },
      closeBtn: '',
      addBtn: ''
    },
    pill: {
      container: 'flex items-center gap-1 shrink-0',
      tab: 'px-2.5 py-1 rounded text-xs cursor-pointer border-none select-none',
      active: {
        background: 'var(--vos-bg-tertiary)',
        color: 'var(--vos-text-primary)'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-tertiary)'
      },
      closeBtn: '',
      addBtn: ''
    }
  },
  vertical: {
    default: {
      container: 'flex flex-col',
      tab: 'flex items-center gap-2 px-3 py-[7px] rounded-[6px] border-none cursor-pointer text-[13px] w-full text-left select-none transition-[background,color] duration-100 hover:bg-[var(--vos-bg-item-hover)] hover:text-[var(--vos-text-primary)]',
      active: {
        background: 'var(--vos-accent-primary)',
        color: '#fff'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-secondary)'
      },
      closeBtn: '',
      addBtn: ''
    },
    compact: {
      container: 'flex flex-col',
      tab: 'flex items-center gap-2 px-3 py-[7px] rounded-[6px] border-none cursor-pointer text-[13px] w-full text-left select-none transition-[background,color] duration-100 hover:bg-[var(--vos-bg-item-hover)] hover:text-[var(--vos-text-primary)]',
      active: {
        background: 'var(--vos-accent-primary)',
        color: '#fff'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-secondary)'
      },
      closeBtn: '',
      addBtn: ''
    },
    dark: {
      container: 'flex flex-col',
      tab: 'flex items-center gap-2 px-3 py-[7px] rounded-[6px] border-none cursor-pointer text-[13px] w-full text-left select-none transition-[background,color] duration-100 hover:bg-[var(--vos-bg-item-hover)] hover:text-[var(--vos-text-primary)]',
      active: {
        background: 'var(--vos-accent-primary)',
        color: '#fff'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-secondary)'
      },
      closeBtn: '',
      addBtn: ''
    },
    underline: {
      container: 'flex flex-col',
      tab: 'flex items-center gap-2 px-3 py-[7px] rounded-[6px] border-none cursor-pointer text-[13px] w-full text-left select-none transition-[background,color] duration-100 hover:bg-[var(--vos-bg-item-hover)] hover:text-[var(--vos-text-primary)]',
      active: {
        background: 'var(--vos-accent-primary)',
        color: '#fff'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-secondary)'
      },
      closeBtn: '',
      addBtn: ''
    },
    pill: {
      container: 'flex flex-col',
      tab: 'flex items-center gap-2 px-3 py-[7px] rounded-[6px] border-none cursor-pointer text-[13px] w-full text-left select-none transition-[background,color] duration-100 hover:bg-[var(--vos-bg-item-hover)] hover:text-[var(--vos-text-primary)]',
      active: {
        background: 'var(--vos-accent-primary)',
        color: '#fff'
      },
      inactive: {
        background: 'transparent',
        color: 'var(--vos-text-secondary)'
      },
      closeBtn: '',
      addBtn: ''
    }
  }
}

export function Tabs<T extends TabItemData = TabItemData>({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onDoubleClick,
  onAuxClick,
  renderPrefix,
  renderSuffix,
  renderContent,
  variant = 'default',
  orientation = 'horizontal',
  showAddButton,
  onAdd,
  addButtonTitle,
  closeButtonTitle = '关闭',
  closeButtonAlwaysVisible = false,
  className,
  block = false
}: TabsProps<T>) {
  const styles = VARIANT_STYLES[orientation][variant]

  const handleAuxClick = (e: MouseEvent, tabId: string) => {
    if (e.button === 1 && onClose) {
      e.stopPropagation()
      onClose(tabId)
      return
    }
    onAuxClick?.(e, tabId)
  }

  const isClosable = (tab: T): boolean => {
    if (!onClose) return false
    if (tab.closable === false) return false
    return true
  }

  const isCloseVisible = (tab: T): boolean => {
    if (typeof closeButtonAlwaysVisible === 'function') return closeButtonAlwaysVisible(tab)
    return closeButtonAlwaysVisible
  }

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        const activeStyle = isActive ? styles.active : styles.inactive
        const closable = isClosable(tab)

        const blockClass = block && orientation === 'horizontal' ? ' flex-1 justify-center' : ''
        const tabClass = `${styles.tab}${blockClass}`

        return (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            className={tabClass}
            style={activeStyle}
            onClick={() => onActivate(tab.id)}
            onDoubleClick={() => onDoubleClick?.(tab.id)}
            onAuxClick={e => handleAuxClick(e, tab.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') onActivate(tab.id)
            }}
          >
            {renderPrefix?.(tab, isActive)}
            {renderContent ? (
              renderContent(tab, isActive)
            ) : tab.label ? (
              <span className="truncate flex-1 text-center">{tab.label}</span>
            ) : null}
            {renderSuffix?.(tab, isActive)}
            {variant === 'underline' && isActive && (
              <div
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                style={{ background: 'var(--vos-accent-primary)' }}
              />
            )}
            {orientation === 'horizontal' && closable && (
              <button
                type="button"
                className={`${styles.closeBtn} ${isCloseVisible(tab) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                onClick={e => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                title={closeButtonTitle}
              >
                <X size={variant === 'compact' ? 10 : 11} />
              </button>
            )}
          </div>
        )
      })}
      {orientation === 'horizontal' && showAddButton && onAdd && (
        <button type="button" className={styles.addBtn} onClick={onAdd} title={addButtonTitle}>
          <Plus size={variant === 'compact' ? 12 : 14} />
        </button>
      )}
    </div>
  )
}
