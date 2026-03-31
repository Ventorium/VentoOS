import { beforeEach, describe, expect, it } from 'vitest'
import type { AppManifest } from '../apps/manifest'
import { useAppStore } from '../apps/store'

function makeManifest(id: string, name?: string): AppManifest {
  return {
    id,
    name: name ?? id,
    version: '1.0.0',
    author: { name: 'test' },
    icon: null,
    multiWindow: false,
    component: () => Promise.resolve({ default: () => null })
  }
}

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useAppStore.setState({ apps: new Map() })
  })

  it('should register an app', () => {
    const { registerApp, getApp } = useAppStore.getState()
    registerApp(makeManifest('k8s', 'Kubernetes'))

    const app = getApp('k8s')
    expect(app).toBeDefined()
    expect(app!.name).toBe('Kubernetes')
  })

  it('should re-register (update) an app idempotently', () => {
    const { registerApp, getApp } = useAppStore.getState()
    registerApp(makeManifest('db', 'Database v1'))
    registerApp(makeManifest('db', 'Database v2'))

    const app = getApp('db')
    expect(app!.name).toBe('Database v2')
    expect(useAppStore.getState().apps.size).toBe(1)
  })

  it('should unregister an app', () => {
    const { registerApp, unregisterApp, getApp } = useAppStore.getState()
    registerApp(makeManifest('redis'))
    unregisterApp('redis')

    expect(getApp('redis')).toBeUndefined()
  })

  it('should return undefined for unknown app', () => {
    expect(useAppStore.getState().getApp('nonexistent')).toBeUndefined()
  })

  it('should list all registered apps', () => {
    const { registerApp } = useAppStore.getState()
    registerApp(makeManifest('a'))
    registerApp(makeManifest('b'))
    registerApp(makeManifest('c'))

    const all = useAppStore.getState().getAllApps()
    expect(all).toHaveLength(3)
    expect(all.map(a => a.id).sort()).toEqual(['a', 'b', 'c'])
  })
})
