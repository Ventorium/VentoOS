import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TopBar from '@/shell/TopBar'
import LoginScreen from '@/shell/LoginScreen'
import { useAuthStore } from '@/services/auth'

describe('branding surfaces', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      token: null,
      initialized: false,
      locked: true
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the VentoOS logo on the lock screen', () => {
    render(<LoginScreen />)

    expect(screen.getByAltText('VentoOS logo')).toBeInTheDocument()
  })

  it('renders the VentoOS logo inside the top bar system button', () => {
    render(<TopBar />)

    const systemButton = screen.getByTitle('VentoOS')
    expect(within(systemButton).getByAltText('VentoOS logo')).toBeInTheDocument()
  })
})
