import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '@/services/auth'
import LoginScreen from '@/shell/LoginScreen'
import TopBar from '@/shell/TopBar'

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

  it('keeps unlock mode copy minimal on the lock screen', () => {
    useAuthStore.setState({
      token: null,
      initialized: true,
      locked: true
    })

    render(<LoginScreen />)

    expect(screen.getByText('VentoOS')).toBeInTheDocument()
    expect(screen.queryByText('VentoOS System')).not.toBeInTheDocument()
    expect(screen.queryByText('解锁系统')).not.toBeInTheDocument()
    expect(screen.queryByText('输入密码以继续访问你的基础设施工作台')).not.toBeInTheDocument()
  })

  it('uses a single concise setup prompt', () => {
    render(<LoginScreen />)

    expect(screen.getByText('设置解锁密码')).toBeInTheDocument()
    expect(screen.queryByText('初始化安全访问')).not.toBeInTheDocument()
    expect(screen.queryByText('首次使用，请设置一个访问密码')).not.toBeInTheDocument()
  })

  it('renders the VentoOS logo inside the top bar system button', () => {
    render(<TopBar />)

    const systemButton = screen.getByTitle('VentoOS')
    expect(within(systemButton).getByAltText('VentoOS logo')).toBeInTheDocument()
  })
})
