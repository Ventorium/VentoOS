import { describe, expect, test } from 'vitest'
import { monitorManifest } from '../manifest'

describe('Monitor App Manifest', () => {
  test('has correct app id', () => {
    expect(monitorManifest.id).toBe('monitor')
  })

  test('has correct name', () => {
    expect(monitorManifest.name).toBe('监控面板')
  })

  test('is single window', () => {
    expect(monitorManifest.multiWindow).toBe(false)
  })

  test('has lazy component loader', () => {
    expect(typeof monitorManifest.component).toBe('function')
  })

  test('has correct permissions', () => {
    expect(monitorManifest.permissions).toContain('storage')
  })

  test('has default size', () => {
    expect(monitorManifest.defaultSize).toBeDefined()
    expect(monitorManifest.defaultSize!.width).toBeGreaterThan(0)
    expect(monitorManifest.defaultSize!.height).toBeGreaterThan(0)
  })
})
