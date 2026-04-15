/**
 * Database App — Types & Constants Tests
 */

import { describe, expect, it } from 'vitest'
import { OBJECT_CATEGORIES } from '../types'

describe('OBJECT_CATEGORIES', () => {
  it('postgresql has tables, views, materialized_views, functions, queries', () => {
    const keys = OBJECT_CATEGORIES['postgresql'].map((c) => c.key)
    expect(keys).toContain('tables')
    expect(keys).toContain('views')
    expect(keys).toContain('materialized_views')
    expect(keys).toContain('functions')
    expect(keys).toContain('queries')
  })

  it('mysql has tables, views, functions, events, queries', () => {
    const keys = OBJECT_CATEGORIES['mysql'].map((c) => c.key)
    expect(keys).toContain('tables')
    expect(keys).toContain('views')
    expect(keys).toContain('functions')
    expect(keys).toContain('events')
    expect(keys).toContain('queries')
  })

  it('mysql does not have materialized_views', () => {
    const keys = OBJECT_CATEGORIES['mysql'].map((c) => c.key)
    expect(keys).not.toContain('materialized_views')
  })

  it('sqlite has tables, views, triggers, queries', () => {
    const keys = OBJECT_CATEGORIES['sqlite'].map((c) => c.key)
    expect(keys).toContain('tables')
    expect(keys).toContain('views')
    expect(keys).toContain('triggers')
    expect(keys).toContain('queries')
  })

  it('sqlite does not have materialized_views or events', () => {
    const keys = OBJECT_CATEGORIES['sqlite'].map((c) => c.key)
    expect(keys).not.toContain('materialized_views')
    expect(keys).not.toContain('events')
  })

  it('all categories have non-empty labels', () => {
    for (const [engine, cats] of Object.entries(OBJECT_CATEGORIES)) {
      for (const cat of cats) {
        expect(cat.label, `${engine}.${cat.key} label should not be empty`).toBeTruthy()
      }
    }
  })
})
