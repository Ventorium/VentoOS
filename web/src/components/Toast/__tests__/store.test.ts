import { describe, expect, it, vi } from 'vitest'
import { generateToastId, toast, useToastStore } from '../store'

describe('Toast store', () => {
  it('generates unique toast IDs', () => {
    const id1 = generateToastId()
    const id2 = generateToastId()
    expect(id1).not.toBe(id2)
    expect(id1.startsWith('toast-')).toBe(true)
  })

  it('adds and removes toasts', () => {
    useToastStore.setState({ toasts: [] })

    useToastStore.getState().addToast({ id: 't1', message: 'hello', type: 'info', duration: 0 })
    let state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].message).toBe('hello')

    useToastStore.getState().removeToast('t1')
    state = useToastStore.getState()
    expect(state.toasts).toHaveLength(0)
  })

  it('auto-removes toast after duration', async () => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })

    useToastStore.getState().addToast({ id: 't2', message: 'auto', type: 'success', duration: 100 })
    let state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)

    vi.advanceTimersByTime(150)
    state = useToastStore.getState()
    expect(state.toasts).toHaveLength(0)

    vi.useRealTimers()
  })

  it('toast helper adds correct type', () => {
    const store = useToastStore.getState()
    // reset
    useToastStore.setState({ toasts: [] })

    toast.success('已复制')
    let state = useToastStore.getState()
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].type).toBe('success')
    expect(state.toasts[0].message).toBe('已复制')

    toast.error('失败')
    state = useToastStore.getState()
    expect(state.toasts).toHaveLength(2)
    expect(state.toasts[1].type).toBe('error')

    toast.warning('警告')
    state = useToastStore.getState()
    expect(state.toasts).toHaveLength(3)
    expect(state.toasts[2].type).toBe('warning')

    toast.info('信息')
    state = useToastStore.getState()
    expect(state.toasts).toHaveLength(4)
    expect(state.toasts[3].type).toBe('info')
  })
})
