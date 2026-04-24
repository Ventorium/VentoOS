import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/services/settings'
import { useThemeSync } from './useTheme'

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }))

vi.mock('@/kernel', () => ({
  systemChannel: {
    notify
  }
}))

function ThemeHarness() {
  useThemeSync()
  return null
}

describe('useThemeSync accent override', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    })
  })

  beforeEach(() => {
    notify.mockClear()
    document.documentElement.removeAttribute('class')
    document.documentElement.style.removeProperty('--vos-accent-primary')
    useSettingsStore.setState({
      themeMode: 'dark',
      accentColor: '#FF9500',
      resolvedTheme: 'dark'
    })
  })

  it('keeps the custom accent color when theme mode changes', async () => {
    render(<ThemeHarness />)

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--vos-accent-primary')).toBe('#FF9500')
    })

    act(() => {
      useSettingsStore.setState({ themeMode: 'light' })
    })

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--vos-accent-primary')).toBe('#FF9500')
    })
  })
})
