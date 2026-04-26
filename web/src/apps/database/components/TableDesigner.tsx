import { Copy, Key, Minus, Plus, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, FormSelect, Tabs } from '@/components/ui'
import { toast } from '@/components/Toast'
import { dbApi } from '../api'
import { useDatabaseStore } from '../stores'
import type { CheckConstraint, ColumnInfo, ForeignKeyInfo, IndexInfo, TriggerInfo, UniqueConstraint } from '../types'

type DesignerTab = 'columns' | 'indexes' | 'foreignKeys' | 'unique' | 'checks' | 'triggers' | 'comment' | 'sql'

const DESIGNER_TABS: { key: DesignerTab; label: string }[] = [
  { key: 'columns', label: '字段' },
  { key: 'indexes', label: '索引' },
  { key: 'foreignKeys', label: '外键' },
  { key: 'unique', label: '唯一键' },
  { key: 'checks', label: '检查' },
  { key: 'triggers', label: '触发器' },
  { key: 'comment', label: '注释' },
  { key: 'sql', label: 'SQL预览' }
]

const SQL_TYPES = [
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'serial',
  'bigserial',
  'varchar',
  'char',
  'text',
  'boolean',
  'bool',
  'float',
  'double',
  'decimal',
  'numeric',
  'real',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'uuid',
  'json',
  'jsonb',
  'bytea',
  'blob',
  'inet',
  'cidr',
  'macaddr',
  'xml',
  'money',
  'interval',
  'enum',
  'array'
]

const INDEX_METHODS = ['BTree', 'Hash', 'GiST', 'GIN']
const FK_ACTIONS = ['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION'] as const
const TRIGGER_TIMINGS = ['BEFORE', 'AFTER', 'INSTEAD OF'] as const
const TRIGGER_EVENTS = ['INSERT', 'UPDATE', 'DELETE'] as const
const COLLATIONS = ['default', 'C', 'POSIX', 'en_US.UTF-8', 'zh_CN.UTF-8']

function makeDefaultColumn(): ColumnInfo {
  return {
    name: '',
    data_type: 'varchar',
    nullable: true,
    default_value: null,
    is_primary_key: false,
    length: undefined,
    precision: undefined,
    collation: undefined,
    comment: undefined
  }
}

export function TableDesigner() {
  const { tableStructure, selectedNode } = useDatabaseStore()

  const [activeTab, setActiveTab] = useState<DesignerTab>('columns')
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([])
  const [uniqueConstraints, setUniqueConstraints] = useState<UniqueConstraint[]>([])
  const [checkConstraints, setCheckConstraints] = useState<CheckConstraint[]>([])
  const [triggers, setTriggers] = useState<TriggerInfo[]>([])
  const [tableComment, setTableComment] = useState('')
  const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const tableName = selectedNode?.name ?? 'new_table'
  const connId = selectedNode?.connId ?? ''

  useEffect(() => {
    if (tableStructure) {
      setColumns(tableStructure.columns.map(c => ({ ...c })))
      setIndexes(tableStructure.indexes.map(i => ({ ...i })))
      setForeignKeys((tableStructure.foreignKeys ?? []).map(fk => ({ ...fk })))
      setUniqueConstraints((tableStructure.uniqueConstraints ?? []).map(u => ({ ...u })))
      setCheckConstraints((tableStructure.checkConstraints ?? []).map(ck => ({ ...ck })))
      setTriggers((tableStructure.triggers ?? []).map(t => ({ ...t })))
    }
  }, [tableStructure])

  const addColumn = useCallback(() => {
    setColumns(prev => [...prev, makeDefaultColumn()])
    setSelectedColumnIndex(columns.length)
  }, [columns.length])

  const removeColumn = useCallback(() => {
    if (selectedColumnIndex === null) return
    setColumns(prev => prev.filter((_, i) => i !== selectedColumnIndex))
    setSelectedColumnIndex(null)
  }, [selectedColumnIndex])

  const togglePrimaryKey = useCallback(() => {
    if (selectedColumnIndex === null) return
    setColumns(prev =>
      prev.map((col, i) =>
        i === selectedColumnIndex
          ? { ...col, is_primary_key: !col.is_primary_key, nullable: col.is_primary_key ? col.nullable : false }
          : col
      )
    )
  }, [selectedColumnIndex])

  const updateColumn = useCallback((index: number, field: keyof ColumnInfo, value: unknown) => {
    setColumns(prev => prev.map((col, i) => (i === index ? { ...col, [field]: value } : col)))
  }, [])

  const generatedSql = useMemo(() => {
    const lines: string[] = []
    lines.push(`CREATE TABLE "${tableName}" (`)

    const colDefs: string[] = columns.map(col => {
      let def = `  "${col.name}" ${col.data_type}`
      if (col.length) def += `(${col.length}${col.precision ? `, ${col.precision}` : ''})`
      if (!col.nullable) def += ' NOT NULL'
      if (col.default_value) def += ` DEFAULT ${col.default_value}`
      return def
    })

    const pks = columns.filter(c => c.is_primary_key).map(c => `"${c.name}"`)
    if (pks.length > 0) {
      colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`)
    }

    for (const u of uniqueConstraints) {
      colDefs.push(`  CONSTRAINT "${u.name}" UNIQUE (${u.columns.map(c => `"${c}"`).join(', ')})`)
    }

    for (const ck of checkConstraints) {
      colDefs.push(`  CONSTRAINT "${ck.name}" CHECK (${ck.expression})`)
    }

    for (const fk of foreignKeys) {
      colDefs.push(
        `  CONSTRAINT "${fk.name}" FOREIGN KEY ("${fk.column}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}") ON DELETE ${fk.onDelete} ON UPDATE ${fk.onUpdate}`
      )
    }

    lines.push(colDefs.join(',\n'))
    lines.push(');')

    if (tableComment) {
      lines.push(`\nCOMMENT ON TABLE "${tableName}" IS '${tableComment.replace(/'/g, "''")}';`)
    }

    for (const col of columns) {
      if (col.comment) {
        lines.push(`COMMENT ON COLUMN "${tableName}"."${col.name}" IS '${col.comment.replace(/'/g, "''")}';`)
      }
    }

    for (const idx of indexes) {
      const u = idx.unique ? 'UNIQUE ' : ''
      const m = idx.method ? ` USING ${idx.method}` : ''
      lines.push(`CREATE ${u}INDEX "${idx.name}" ON "${tableName}"${m} (${idx.columns.map(c => `"${c}"`).join(', ')});`)
    }

    return lines.join('\n')
  }, [columns, indexes, foreignKeys, uniqueConstraints, checkConstraints, tableName, tableComment])

  const handleSave = useCallback(async () => {
    if (!connId || !generatedSql.trim()) {
      toast.error('缺少连接上下文，无法保存表结构')
      return
    }

    setSaving(true)
    try {
      await dbApi.executeDbSql(connId, generatedSql)
      toast.success(`表 ${tableName} 的结构已提交`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存表结构失败')
    } finally {
      setSaving(false)
    }
  }, [connId, generatedSql, tableName])

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(generatedSql).then(() => toast.success('已复制'))
  }, [generatedSql])

  const selectedCol = selectedColumnIndex !== null ? columns[selectedColumnIndex] : null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 shrink-0 flex items-center gap-1 px-3 border-b border-solid border-(--vos-border)">
        <Button variant="toolbar" size="sm" leadingIcon={<Save size={14} />} onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
        <Button variant="toolbar" size="sm" leadingIcon={<Plus size={14} />} onClick={addColumn}>
          添加字段
        </Button>
        <Button
          variant="toolbar"
          size="sm"
          leadingIcon={<Minus size={14} />}
          onClick={removeColumn}
          disabled={selectedColumnIndex === null}
        >
          删除字段
        </Button>
        <Button
          variant="toolbar"
          size="sm"
          leadingIcon={<Key size={14} />}
          onClick={togglePrimaryKey}
          disabled={selectedColumnIndex === null}
        >
          设为主键
        </Button>
      </div>

      {/* Tab bar */}
      <Tabs
        tabs={DESIGNER_TABS.map(t => ({ id: t.key, label: t.label }))}
        activeTabId={activeTab}
        onActivate={id => setActiveTab(id as DesignerTab)}
        variant="default"
        className="h-9 border-b border-solid border-(--vos-border) bg-(--vos-bg-elevated) px-2"
      />

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'columns' && (
          <ColumnsTab
            columns={columns}
            selectedIndex={selectedColumnIndex}
            selectedCol={selectedCol}
            onSelect={setSelectedColumnIndex}
            onUpdate={updateColumn}
          />
        )}
        {activeTab === 'indexes' && <IndexesTab indexes={indexes} columns={columns} onChange={setIndexes} />}
        {activeTab === 'foreignKeys' && (
          <ForeignKeysTab foreignKeys={foreignKeys} columns={columns} onChange={setForeignKeys} />
        )}
        {activeTab === 'unique' && (
          <UniqueTab constraints={uniqueConstraints} columns={columns} onChange={setUniqueConstraints} />
        )}
        {activeTab === 'checks' && <ChecksTab constraints={checkConstraints} onChange={setCheckConstraints} />}
        {activeTab === 'triggers' && <TriggersTab triggers={triggers} onChange={setTriggers} />}
        {activeTab === 'comment' && <CommentTab comment={tableComment} onChange={setTableComment} />}
        {activeTab === 'sql' && <SqlPreviewTab sql={generatedSql} onCopy={copyToClipboard} />}
      </div>
    </div>
  )
}

// ── Columns Tab ──────────────────────────────────────────────────────────

function ColumnsTab({
  columns,
  selectedIndex,
  selectedCol,
  onSelect,
  onUpdate
}: {
  columns: ColumnInfo[]
  selectedIndex: number | null
  selectedCol: ColumnInfo | null
  onSelect: (i: number | null) => void
  onUpdate: (i: number, field: keyof ColumnInfo, value: unknown) => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-(--vos-bg-elevated) sticky top-0 z-1">
              <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-40">
                名称
              </th>
              <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-32">
                类型
              </th>
              <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-16">
                长度
              </th>
              <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-16">
                小数点
              </th>
              <th className="text-center px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-16">
                不是Null
              </th>
              <th className="text-center px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-12">
                键
              </th>
              <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
                注释
              </th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, i) => (
              <tr
                key={i}
                className={`cursor-pointer ${selectedIndex === i ? 'bg-(--vos-bg-hover)' : 'hover:bg-(--vos-bg-elevated)'}`}
                onClick={() => onSelect(i)}
              >
                <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                  <input
                    type="text"
                    value={col.name}
                    onChange={e => onUpdate(i, 'name', e.target.value)}
                    className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                    placeholder="column_name"
                  />
                </td>
                <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                  <FormSelect
                    value={col.data_type}
                    onChange={e => onUpdate(i, 'data_type', e.target.value)}
                    variant="minimal"
                    className="w-full text-xs text-(--vos-text) border-none p-0"
                    wrapperClassName="w-full"
                  >
                    {SQL_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </FormSelect>
                </td>
                <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                  <input
                    type="number"
                    value={col.length ?? ''}
                    onChange={e => onUpdate(i, 'length', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  />
                </td>
                <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                  <input
                    type="number"
                    value={col.precision ?? ''}
                    onChange={e => onUpdate(i, 'precision', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  />
                </td>
                <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                  <input
                    type="checkbox"
                    checked={!col.nullable}
                    onChange={e => onUpdate(i, 'nullable', !e.target.checked)}
                    className="cursor-pointer accent-(--vos-primary)"
                  />
                </td>
                <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                  {col.is_primary_key && <Key size={12} className="inline text-(--vos-warning)" />}
                  {col.is_foreign_key && <span className="text-(--vos-info) text-[10px]">FK</span>}
                </td>
                <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                  <input
                    type="text"
                    value={col.comment ?? ''}
                    onChange={e => onUpdate(i, 'comment', e.target.value || undefined)}
                    className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                    placeholder=""
                  />
                </td>
              </tr>
            ))}
            {columns.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-xs text-(--vos-text-secondary)">
                  暂无字段，点击 "添加字段" 开始设计
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom properties panel */}
      {selectedCol && selectedIndex !== null && (
        <div className="shrink-0 border-t border-solid border-(--vos-border) p-3 bg-(--vos-bg-elevated)">
          <div className="text-xs font-medium text-(--vos-text-secondary) mb-2">字段属性</div>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-(--vos-text-secondary)">默认值</span>
              <input
                type="text"
                value={selectedCol.default_value ?? ''}
                onChange={e => onUpdate(selectedIndex, 'default_value', e.target.value || null)}
                className="h-7 px-2 text-xs rounded border border-solid border-(--vos-border) bg-(--vos-bg) text-(--vos-text) outline-none focus:border-(--vos-primary)"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-(--vos-text-secondary)">排序规则</span>
              <FormSelect
                value={selectedCol.collation ?? 'default'}
                onChange={e =>
                  onUpdate(selectedIndex, 'collation', e.target.value === 'default' ? undefined : e.target.value)
                }
                variant="toolbar"
                className="h-7 text-xs"
                wrapperClassName="w-full"
              >
                {COLLATIONS.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-(--vos-text-secondary)">注释</span>
              <textarea
                value={selectedCol.comment ?? ''}
                onChange={e => onUpdate(selectedIndex, 'comment', e.target.value || undefined)}
                rows={1}
                className="px-2 py-1 text-xs rounded border border-solid border-(--vos-border) bg-(--vos-bg) text-(--vos-text) outline-none resize-none focus:border-(--vos-primary)"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Indexes Tab ──────────────────────────────────────────────────────────

function IndexesTab({
  indexes,
  columns,
  onChange
}: {
  indexes: IndexInfo[]
  columns: ColumnInfo[]
  onChange: (v: IndexInfo[]) => void
}) {
  const addIndex = () => {
    onChange([...indexes, { name: '', columns: [], unique: false, method: 'BTree', comment: '' }])
  }

  const update = (i: number, field: keyof IndexInfo, value: unknown) => {
    onChange(indexes.map((idx, j) => (j === i ? { ...idx, [field]: value } : idx)))
  }

  const remove = (i: number) => {
    onChange(indexes.filter((_, j) => j !== i))
  }

  const toggleColumn = (idxI: number, colName: string) => {
    const idx = indexes[idxI]
    const cols = idx.columns.includes(colName) ? idx.columns.filter(c => c !== colName) : [...idx.columns, colName]
    update(idxI, 'columns', cols)
  }

  return (
    <div className="p-3">
      <div className="mb-2">
        <Button variant="toolbar" size="sm" leadingIcon={<Plus size={14} />} onClick={addIndex}>
          添加索引
        </Button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-(--vos-bg-elevated)">
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              索引名
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-24">
              方法
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              字段
            </th>
            <th className="text-center px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-16">
              唯一
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              注释
            </th>
            <th className="w-10 border-b border-solid border-(--vos-border)" />
          </tr>
        </thead>
        <tbody>
          {indexes.map((idx, i) => (
            <tr key={i} className="hover:bg-(--vos-bg-elevated)">
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={idx.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="idx_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <FormSelect
                  value={idx.method ?? 'BTree'}
                  onChange={e => update(i, 'method', e.target.value)}
                  variant="minimal"
                  className="w-full text-xs text-(--vos-text) border-none p-0"
                  wrapperClassName="w-full"
                >
                  {INDEX_METHODS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </FormSelect>
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <div className="flex flex-wrap gap-1">
                  {columns.map(col => (
                    <label key={col.name} className="flex items-center gap-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={idx.columns.includes(col.name)}
                        onChange={() => toggleColumn(i, col.name)}
                        className="accent-(--vos-primary)"
                      />
                      <span className="text-[11px] text-(--vos-text)">{col.name}</span>
                    </label>
                  ))}
                </div>
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="checkbox"
                  checked={idx.unique}
                  onChange={e => update(i, 'unique', e.target.checked)}
                  className="cursor-pointer accent-(--vos-primary)"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={idx.comment ?? ''}
                  onChange={e => update(i, 'comment', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                />
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <button
                  type="button"
                  className="text-(--vos-text-secondary) hover:text-(--vos-error) cursor-pointer bg-transparent border-none p-0"
                  onClick={() => remove(i)}
                >
                  <Minus size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {indexes.length === 0 && <div className="text-center py-6 text-xs text-(--vos-text-secondary)">暂无索引</div>}
    </div>
  )
}

// ── Foreign Keys Tab ─────────────────────────────────────────────────────

function ForeignKeysTab({
  foreignKeys,
  columns,
  onChange
}: {
  foreignKeys: ForeignKeyInfo[]
  columns: ColumnInfo[]
  onChange: (v: ForeignKeyInfo[]) => void
}) {
  const add = () => {
    onChange([
      ...foreignKeys,
      { name: '', column: '', referencedTable: '', referencedColumn: '', onDelete: 'NO ACTION', onUpdate: 'NO ACTION' }
    ])
  }

  const update = (i: number, field: keyof ForeignKeyInfo, value: string) => {
    onChange(foreignKeys.map((fk, j) => (j === i ? { ...fk, [field]: value } : fk)))
  }

  const remove = (i: number) => {
    onChange(foreignKeys.filter((_, j) => j !== i))
  }

  return (
    <div className="p-3">
      <div className="mb-2">
        <Button variant="toolbar" size="sm" leadingIcon={<Plus size={14} />} onClick={add}>
          添加外键
        </Button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-(--vos-bg-elevated)">
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              外键名
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              字段
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              引用表
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              引用字段
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-28">
              删除时
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-28">
              更新时
            </th>
            <th className="w-10 border-b border-solid border-(--vos-border)" />
          </tr>
        </thead>
        <tbody>
          {foreignKeys.map((fk, i) => (
            <tr key={i} className="hover:bg-(--vos-bg-elevated)">
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={fk.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="fk_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <FormSelect
                  value={fk.column}
                  onChange={e => update(i, 'column', e.target.value)}
                  variant="minimal"
                  className="w-full text-xs text-(--vos-text) border-none p-0"
                  wrapperClassName="w-full"
                >
                  <option value="">选择字段</option>
                  {columns.map(c => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </FormSelect>
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={fk.referencedTable}
                  onChange={e => update(i, 'referencedTable', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="table_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={fk.referencedColumn}
                  onChange={e => update(i, 'referencedColumn', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="column_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <FormSelect
                  value={fk.onDelete}
                  onChange={e => update(i, 'onDelete', e.target.value)}
                  variant="minimal"
                  className="w-full text-xs text-(--vos-text) border-none p-0"
                  wrapperClassName="w-full"
                >
                  {FK_ACTIONS.map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </FormSelect>
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <FormSelect
                  value={fk.onUpdate}
                  onChange={e => update(i, 'onUpdate', e.target.value)}
                  variant="minimal"
                  className="w-full text-xs text-(--vos-text) border-none p-0"
                  wrapperClassName="w-full"
                >
                  {FK_ACTIONS.map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </FormSelect>
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <button
                  type="button"
                  className="text-(--vos-text-secondary) hover:text-(--vos-error) cursor-pointer bg-transparent border-none p-0"
                  onClick={() => remove(i)}
                >
                  <Minus size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {foreignKeys.length === 0 && <div className="text-center py-6 text-xs text-(--vos-text-secondary)">暂无外键</div>}
    </div>
  )
}

// ── Unique Tab ───────────────────────────────────────────────────────────

function UniqueTab({
  constraints,
  columns,
  onChange
}: {
  constraints: UniqueConstraint[]
  columns: ColumnInfo[]
  onChange: (v: UniqueConstraint[]) => void
}) {
  const add = () => {
    onChange([...constraints, { name: '', columns: [] }])
  }

  const update = (i: number, field: keyof UniqueConstraint, value: unknown) => {
    onChange(constraints.map((c, j) => (j === i ? { ...c, [field]: value } : c)))
  }

  const remove = (i: number) => {
    onChange(constraints.filter((_, j) => j !== i))
  }

  const toggleColumn = (ci: number, colName: string) => {
    const c = constraints[ci]
    const cols = c.columns.includes(colName) ? c.columns.filter(x => x !== colName) : [...c.columns, colName]
    update(ci, 'columns', cols)
  }

  return (
    <div className="p-3">
      <div className="mb-2">
        <Button variant="toolbar" size="sm" leadingIcon={<Plus size={14} />} onClick={add}>
          添加唯一键
        </Button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-(--vos-bg-elevated)">
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              唯一键名
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              字段列表
            </th>
            <th className="w-10 border-b border-solid border-(--vos-border)" />
          </tr>
        </thead>
        <tbody>
          {constraints.map((c, i) => (
            <tr key={i} className="hover:bg-(--vos-bg-elevated)">
              <td className="px-2 py-1 border-b border-solid border-(--vos-border) w-48">
                <input
                  type="text"
                  value={c.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="uq_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <div className="flex flex-wrap gap-1">
                  {columns.map(col => (
                    <label key={col.name} className="flex items-center gap-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={c.columns.includes(col.name)}
                        onChange={() => toggleColumn(i, col.name)}
                        className="accent-(--vos-primary)"
                      />
                      <span className="text-[11px] text-(--vos-text)">{col.name}</span>
                    </label>
                  ))}
                </div>
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <button
                  type="button"
                  className="text-(--vos-text-secondary) hover:text-(--vos-error) cursor-pointer bg-transparent border-none p-0"
                  onClick={() => remove(i)}
                >
                  <Minus size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {constraints.length === 0 && (
        <div className="text-center py-6 text-xs text-(--vos-text-secondary)">暂无唯一键</div>
      )}
    </div>
  )
}

// ── Checks Tab ───────────────────────────────────────────────────────────

function ChecksTab({
  constraints,
  onChange
}: {
  constraints: CheckConstraint[]
  onChange: (v: CheckConstraint[]) => void
}) {
  const add = () => {
    onChange([...constraints, { name: '', expression: '' }])
  }

  const update = (i: number, field: keyof CheckConstraint, value: string) => {
    onChange(constraints.map((c, j) => (j === i ? { ...c, [field]: value } : c)))
  }

  const remove = (i: number) => {
    onChange(constraints.filter((_, j) => j !== i))
  }

  return (
    <div className="p-3">
      <div className="mb-2">
        <Button variant="toolbar" size="sm" leadingIcon={<Plus size={14} />} onClick={add}>
          添加检查
        </Button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-(--vos-bg-elevated)">
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-48">
              约束名
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              检查表达式
            </th>
            <th className="w-10 border-b border-solid border-(--vos-border)" />
          </tr>
        </thead>
        <tbody>
          {constraints.map((c, i) => (
            <tr key={i} className="hover:bg-(--vos-bg-elevated)">
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={c.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="ck_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={c.expression}
                  onChange={e => update(i, 'expression', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0 font-mono"
                  placeholder="age > 0"
                />
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <button
                  type="button"
                  className="text-(--vos-text-secondary) hover:text-(--vos-error) cursor-pointer bg-transparent border-none p-0"
                  onClick={() => remove(i)}
                >
                  <Minus size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {constraints.length === 0 && (
        <div className="text-center py-6 text-xs text-(--vos-text-secondary)">暂无检查约束</div>
      )}
    </div>
  )
}

// ── Triggers Tab ─────────────────────────────────────────────────────────

function TriggersTab({ triggers, onChange }: { triggers: TriggerInfo[]; onChange: (v: TriggerInfo[]) => void }) {
  const add = () => {
    onChange([...triggers, { name: '', timing: 'BEFORE', event: 'INSERT', enabled: true, definition: '' }])
  }

  const update = (i: number, field: keyof TriggerInfo, value: unknown) => {
    onChange(triggers.map((t, j) => (j === i ? { ...t, [field]: value } : t)))
  }

  const remove = (i: number) => {
    onChange(triggers.filter((_, j) => j !== i))
  }

  return (
    <div className="p-3">
      <div className="mb-2">
        <Button variant="toolbar" size="sm" leadingIcon={<Plus size={14} />} onClick={add}>
          添加触发器
        </Button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-(--vos-bg-elevated)">
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              触发器名
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-28">
              时机
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-24">
              事件
            </th>
            <th className="text-center px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border) w-16">
              启用
            </th>
            <th className="text-left px-2 py-1.5 font-medium text-(--vos-text-secondary) border-b border-solid border-(--vos-border)">
              定义
            </th>
            <th className="w-10 border-b border-solid border-(--vos-border)" />
          </tr>
        </thead>
        <tbody>
          {triggers.map((t, i) => (
            <tr key={i} className="hover:bg-(--vos-bg-elevated)">
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={t.name}
                  onChange={e => update(i, 'name', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0"
                  placeholder="trg_name"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <FormSelect
                  value={t.timing}
                  onChange={e => update(i, 'timing', e.target.value)}
                  variant="minimal"
                  className="w-full text-xs text-(--vos-text) border-none p-0"
                  wrapperClassName="w-full"
                >
                  {TRIGGER_TIMINGS.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FormSelect>
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <FormSelect
                  value={t.event}
                  onChange={e => update(i, 'event', e.target.value)}
                  variant="minimal"
                  className="w-full text-xs text-(--vos-text) border-none p-0"
                  wrapperClassName="w-full"
                >
                  {TRIGGER_EVENTS.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FormSelect>
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={e => update(i, 'enabled', e.target.checked)}
                  className="cursor-pointer accent-(--vos-primary)"
                />
              </td>
              <td className="px-2 py-1 border-b border-solid border-(--vos-border)">
                <input
                  type="text"
                  value={t.definition}
                  onChange={e => update(i, 'definition', e.target.value)}
                  className="w-full bg-transparent outline-none text-xs text-(--vos-text) border-none p-0 font-mono"
                  placeholder="EXECUTE FUNCTION ..."
                />
              </td>
              <td className="text-center px-2 py-1 border-b border-solid border-(--vos-border)">
                <button
                  type="button"
                  className="text-(--vos-text-secondary) hover:text-(--vos-error) cursor-pointer bg-transparent border-none p-0"
                  onClick={() => remove(i)}
                >
                  <Minus size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {triggers.length === 0 && <div className="text-center py-6 text-xs text-(--vos-text-secondary)">暂无触发器</div>}
    </div>
  )
}

// ── Comment Tab ──────────────────────────────────────────────────────────

function CommentTab({ comment, onChange }: { comment: string; onChange: (v: string) => void }) {
  return (
    <div className="p-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-(--vos-text-secondary)">表注释</span>
        <textarea
          value={comment}
          onChange={e => onChange(e.target.value)}
          rows={4}
          className="w-full px-2 py-1.5 text-xs rounded border border-solid border-(--vos-border) bg-(--vos-bg) text-(--vos-text) outline-none resize-y focus:border-(--vos-primary)"
          placeholder="输入表注释..."
        />
      </label>
    </div>
  )
}

// ── SQL Preview Tab ──────────────────────────────────────────────────────

function SqlPreviewTab({ sql, onCopy }: { sql: string; onCopy: () => void }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-end p-2">
        <Button variant="toolbar" size="sm" leadingIcon={<Copy size={14} />} onClick={onCopy}>
          复制
        </Button>
      </div>
      <pre className="flex-1 overflow-auto m-0 px-4 pb-4 text-xs font-mono text-(--vos-text) whitespace-pre-wrap leading-5">
        {sql}
      </pre>
    </div>
  )
}
