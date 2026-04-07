import { describe, expect, test } from 'vitest'
import { monitorApi } from '../api'

describe('Monitor API', () => {
  test('exports getSystemMetrics function', () => {
    expect(typeof monitorApi.getSystemMetrics).toBe('function')
  })

  test('exports getProcessMetrics function', () => {
    expect(typeof monitorApi.getProcessMetrics).toBe('function')
  })
})
