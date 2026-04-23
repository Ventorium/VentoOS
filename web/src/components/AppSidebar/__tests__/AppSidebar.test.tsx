import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { AppSidebar } from '../index'

describe('AppSidebar', () => {
  test('renders activity icons', () => {
    render(
      <AppSidebar
        activities={[
          {
            id: 'http',
            label: 'HTTP',
            icon: <span data-testid="http-icon">H</span>
          }
        ]}
        activeId="http"
        onSelect={() => {}}
        panelContent={<div>panel</div>}
      />
    )

    expect(screen.getByTestId('http-icon')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'HTTP' }).getAttribute('aria-pressed')).toBe('true')
  })

  test('calls onSelect when activity is clicked', () => {
    const handleSelect = vi.fn()

    render(
      <AppSidebar
        activities={[
          {
            id: 'http',
            label: 'HTTP',
            icon: <span>H</span>
          }
        ]}
        activeId={null}
        onSelect={handleSelect}
        panelContent={null}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'HTTP' }))
    expect(handleSelect).toHaveBeenCalledWith('http')
  })
})