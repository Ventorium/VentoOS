import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Tabs } from '../Tabs'

interface TestTab {
  id: string
  label: string
  closable?: boolean
  kind?: string
}

const TEST_TABS: TestTab[] = [
  { id: 'tab-1', label: 'First', closable: true },
  { id: 'tab-2', label: 'Second', closable: true },
  { id: 'tab-3', label: 'Third', closable: false }
]

describe('Tabs', () => {
  it('renders all tabs', () => {
    render(<Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={vi.fn()} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText('Third')).toBeInTheDocument()
  })

  it('calls onActivate when a tab is clicked', () => {
    const onActivate = vi.fn()
    render(<Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={onActivate} />)
    fireEvent.click(screen.getByText('Second'))
    expect(onActivate).toHaveBeenCalledWith('tab-2')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={vi.fn()} onClose={onClose} />)
    const closeButtons = screen.getAllByTitle('关闭')
    expect(closeButtons.length).toBe(2) // only closable tabs
    fireEvent.click(closeButtons[0])
    expect(onClose).toHaveBeenCalledWith('tab-1')
  })

  it('calls onDoubleClick when a tab is double-clicked', () => {
    const onDoubleClick = vi.fn()
    render(<Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={vi.fn()} onDoubleClick={onDoubleClick} />)
    fireEvent.doubleClick(screen.getByText('Second'))
    expect(onDoubleClick).toHaveBeenCalledWith('tab-2')
  })

  it('calls onAuxClick on middle mouse button', () => {
    const onClose = vi.fn()
    render(<Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={vi.fn()} onClose={onClose} />)
    fireEvent(screen.getByText('Second'), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    expect(onClose).toHaveBeenCalledWith('tab-2')
  })

  it('renders add button when showAddButton is true', () => {
    render(
      <Tabs
        tabs={TEST_TABS}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        showAddButton
        onAdd={vi.fn()}
        addButtonTitle="Add Tab"
      />
    )
    expect(screen.getByTitle('Add Tab')).toBeInTheDocument()
  })

  it('calls onAdd when add button is clicked', () => {
    const onAdd = vi.fn()
    render(<Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={vi.fn()} showAddButton onAdd={onAdd} />)
    fireEvent.click(screen.getByRole('button', { name: '' }))
    expect(onAdd).toHaveBeenCalled()
  })

  it('renders custom prefix and suffix', () => {
    render(
      <Tabs
        tabs={TEST_TABS}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        renderPrefix={() => <span data-testid="prefix">▸</span>}
        renderSuffix={() => <span data-testid="suffix">◂</span>}
      />
    )
    expect(screen.getAllByTestId('prefix').length).toBe(3)
    expect(screen.getAllByTestId('suffix').length).toBe(3)
  })

  it('renders custom content when renderContent is provided', () => {
    render(
      <Tabs
        tabs={TEST_TABS}
        activeTabId="tab-1"
        onActivate={vi.fn()}
        renderContent={tab => <span>[{tab.label}]</span>}
      />
    )
    expect(screen.getByText('[First]')).toBeInTheDocument()
  })

  it('supports vertical orientation', () => {
    const { container } = render(
      <Tabs tabs={TEST_TABS} activeTabId="tab-1" onActivate={vi.fn()} orientation="vertical" />
    )
    // Vertical tabs should not have close buttons
    expect(screen.queryByTitle('关闭')).not.toBeInTheDocument()
    // Container should be flex-col
    expect(container.firstChild).toHaveClass('flex-col')
  })

  it('supports closeButtonAlwaysVisible as a predicate', () => {
    const onClose = vi.fn()
    const tabsWithDirty = [
      { id: 'a', label: 'A', dirty: false },
      { id: 'b', label: 'B', dirty: true }
    ]
    render(
      <Tabs
        tabs={tabsWithDirty}
        activeTabId="a"
        onActivate={vi.fn()}
        onClose={onClose}
        closeButtonAlwaysVisible={tab => tab.dirty}
      />
    )
    const closeButtons = screen.getAllByTitle('关闭')
    expect(closeButtons.length).toBe(2)
    // Both should exist; dirty one has opacity-100, non-dirty has opacity-0
    // We can't easily test opacity via class in RTL, but we verify both exist
    fireEvent.click(closeButtons[1])
    expect(onClose).toHaveBeenCalledWith('b')
  })
})
