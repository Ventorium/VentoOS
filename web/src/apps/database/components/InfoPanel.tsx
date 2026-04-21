import { Database, Layers, Link, Server, Table } from 'lucide-react'
import { useDatabaseStore } from '../stores'
import type { InfoPanelData, TreeNodeType } from '../types'

const TYPE_LABELS: Partial<Record<TreeNodeType, string>> = {
  connection: '连接',
  database: '数据库',
  schema: '模式',
  table: '表',
  view: '视图',
  materialized_view: '实体化视图',
  function: '函数',
  event: '事件',
  trigger: '触发器'
}

function TypeIcon({ type }: { type: TreeNodeType }) {
  const className = 'text-(--vos-text-secondary)'
  switch (type) {
    case 'connection':
      return <Server size={32} className={className} />
    case 'database':
      return <Database size={32} className={className} />
    case 'schema':
      return <Layers size={32} className={className} />
    case 'table':
      return <Table size={32} className={className} />
    default:
      return <Link size={32} className={className} />
  }
}

function MetaList({ meta }: { meta: InfoPanelData['meta'] }) {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col">
          <span className="text-[10px] text-(--vos-text-secondary) leading-tight">{key}</span>
          <span className="text-xs text-(--vos-text) leading-tight break-all">
            {typeof value === 'boolean' ? (value ? '是' : '否') : String(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function InfoPanel() {
  const { infoPanelVisible, infoPanelData } = useDatabaseStore()

  if (!infoPanelVisible) return null

  return (
    <div className="w-50 shrink-0 border-l border-solid border-(--vos-border) bg-(--vos-bg-elevated) overflow-y-auto">
      {!infoPanelData ? (
        <div className="flex items-center justify-center h-full text-xs text-(--vos-text-secondary) p-4 text-center">
          选择一个对象以查看详情
        </div>
      ) : (
        <div className="p-3 flex flex-col gap-3">
          {/* Header */}
          <div className="flex flex-col items-center gap-2 py-2">
            <TypeIcon type={infoPanelData.type} />
            <div className="text-sm font-medium text-(--vos-text) text-center break-all">{infoPanelData.name}</div>
            <span className="px-2 py-0.5 rounded text-[10px] bg-(--vos-bg-hover) text-(--vos-text-secondary)">
              {TYPE_LABELS[infoPanelData.type] ?? infoPanelData.type}
            </span>
            {infoPanelData.engine && (
              <span className="px-2 py-0.5 rounded text-[10px] bg-(--vos-primary)/10 text-(--vos-primary)">
                {infoPanelData.engine.toUpperCase()}
              </span>
            )}
          </div>

          {/* Separator */}
          <div className="h-px bg-(--vos-border)" />

          {/* Meta info */}
          <MetaList meta={infoPanelData.meta} />
        </div>
      )}
    </div>
  )
}
