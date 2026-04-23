import { Check, ChevronDown } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface DropdownSelectOption<T extends string = string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  color?: string
  disabled?: boolean
}

export interface DropdownSelectProps<T extends string = string> {
  value?: T | null
  options: DropdownSelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: ReactNode
  triggerIcon?: ReactNode
  align?: 'left' | 'right'
  className?: string
  triggerClassName?: string
  menuClassName?: string
  itemClassName?: string
  renderTriggerContent?: (option?: DropdownSelectOption<T>) => ReactNode
  renderOption?: (option: DropdownSelectOption<T>, selected: boolean) => ReactNode
}

export function DropdownSelect<T extends string = string>({
  value,
  options,
  onChange,
  placeholder,
  triggerIcon,
  align = 'left',
  className,
  triggerClassName,
  menuClassName,
  itemClassName,
  renderTriggerContent,
  renderOption
}: DropdownSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()

  const selectedOption = useMemo(() => options.find(option => option.value === value), [options, value])
  const selectedIndex = useMemo(() => options.findIndex(option => option.value === value && !option.disabled), [options, value])
  const firstEnabledIndex = useMemo(() => options.findIndex(option => !option.disabled), [options])
  const lastEnabledIndex = useMemo(() => {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.disabled) {
        return index
      }
    }

    return -1
  }, [options])

  const resolveInitialIndex = () => {
    if (selectedIndex >= 0) {
      return selectedIndex
    }

    return firstEnabledIndex
  }

  const closeMenu = (restoreFocus = false) => {
    setOpen(false)
    setActiveIndex(-1)

    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }

  const openMenu = (preferredIndex?: number) => {
    const nextIndex = preferredIndex != null && preferredIndex >= 0 ? preferredIndex : resolveInitialIndex()
    setActiveIndex(nextIndex)
    setOpen(true)
  }

  const findNextEnabledIndex = (startIndex: number, direction: 1 | -1) => {
    if (!options.some(option => !option.disabled)) {
      return -1
    }

    let index = startIndex

    for (let remaining = options.length; remaining > 0; remaining -= 1) {
      if (index < 0) {
        index = options.length - 1
      }

      if (index >= options.length) {
        index = 0
      }

      if (!options[index]?.disabled) {
        return index
      }

      index += direction
    }

    return -1
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const initialIndex = resolveInitialIndex()
    if (activeIndex < 0 || options[activeIndex]?.disabled) {
      setActiveIndex(initialIndex)
    }
  }, [activeIndex, open, options, selectedIndex, firstEnabledIndex])

  useEffect(() => {
    if (!open || activeIndex < 0) {
      return
    }

    itemRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openMenu(resolveInitialIndex())
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(selectedIndex >= 0 ? selectedIndex : lastEnabledIndex)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) {
        closeMenu()
      } else {
        openMenu(resolveInitialIndex())
      }
    }
  }

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(currentIndex => findNextEnabledIndex((currentIndex >= 0 ? currentIndex : -1) + 1, 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(currentIndex => findNextEnabledIndex((currentIndex >= 0 ? currentIndex : options.length) - 1, -1))
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(firstEnabledIndex)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(lastEnabledIndex)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const option = activeIndex >= 0 ? options[activeIndex] : undefined
      if (!option || option.disabled) {
        return
      }

      event.preventDefault()
      onChange(option.value)
      closeMenu(true)
    }
  }

  return (
    <div className={`vos-dropdown ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`vos-dropdown-trigger ${triggerClassName ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          {triggerIcon}
          <span className="truncate">
            {renderTriggerContent ? renderTriggerContent(selectedOption) : (selectedOption?.label ?? placeholder)}
          </span>
        </span>
        <ChevronDown size={12} className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => closeMenu()} />
          <div id={listboxId} className={`vos-dropdown-menu ${menuClassName ?? ''}`} data-align={align} role="listbox" onKeyDown={handleMenuKeyDown}>
            {options.map((option, index) => {
              const selected = option.value === value

              return (
                <button
                  key={option.value}
                  ref={node => {
                    itemRefs.current[index] = node
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  tabIndex={index === activeIndex ? 0 : -1}
                  className={`vos-dropdown-item ${selected ? 'active' : ''} ${itemClassName ?? ''}`}
                  onMouseEnter={() => {
                    if (!option.disabled) {
                      setActiveIndex(index)
                    }
                  }}
                  onClick={() => {
                    if (option.disabled) {
                      return
                    }

                    onChange(option.value)
                    closeMenu(true)
                  }}
                >
                  {renderOption ? (
                    renderOption(option, selected)
                  ) : (
                    <>
                      <span className="flex items-center gap-2 min-w-0 flex-1" style={option.color ? { color: option.color } : undefined}>
                        {option.icon}
                        <span className="truncate">{option.label}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {option.meta}
                        {selected && <Check size={12} />}
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
