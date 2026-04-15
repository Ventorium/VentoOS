import { Database } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function DatabaseIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(Database, { size: 22 })
  )
}

export const databaseManifest: AppManifest = {
  id: 'database',
  name: 'Database',
  version: '1.0.0',
  author: { name: 'VentoOS' },
  description: 'Connect and manage PostgreSQL, MySQL, and SQLite databases',
  icon: React.createElement(DatabaseIcon),
  fileAssociations: ['db', 'sqlite', 'sqlite3', 'db3'],
  multiWindow: false,
  defaultSize: { width: 1060, height: 700 },
  minSize: { width: 800, height: 480 },
  permissions: ['network', 'connections', 'notifications'],
  hasBackendPlugin: true,
  component: () => import('./index')
}
