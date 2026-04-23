import { Plus, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { FormSelect } from '@/components/ui'
import { useDatabaseStore } from '../stores'
import type { FilterCondition, FilterOperator, SortRule } from '../types'

const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等于' },
  { value: 'not_equals', label: '不等于' },
  { value: 'greater_than', label: '大于' },
  { value: 'less_than', label: '小于' },
  { value: 'is_null', label: '是 NULL' },
  { value: 'is_not_null', label: '不是 NULL' },
  { value: 'starts_with', label: '以...开头' },
  { value: 'ends_with', label: '以...结尾' },
  { value: 'in_list', label: '在列表中' }
]

const NO_VALUE_OPS = new Set<FilterOperator>(['is_null', 'is_not_null'])

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function FilterPanel({ columns }: { columns: string[] }) {
  const { filterConditions, sortRules, setFilterConditions, setSortRules } = useDatabaseStore()

  const addCondition = useCallback(() => {
    const cond: FilterCondition = {
      id: genId(),
      enabled: true,
      field: columns[0] ?? '',
      operator: 'contains',
      value: '',
      logic: 'and'
    }
    setFilterConditions([...filterConditions, cond])
  }, [columns, filterConditions, setFilterConditions])

  const updateCondition = useCallback(
    (id: string, patch: Partial<FilterCondition>) => {
      setFilterConditions(filterConditions.map(c => (c.id === id ? { ...c, ...patch } : c)))
    },
    [filterConditions, setFilterConditions]
  )

  const removeCondition = useCallback(
    (id: string) => {
      setFilterConditions(filterConditions.filter(c => c.id !== id))
    },
    [filterConditions, setFilterConditions]
  )

  const addSortRule = useCallback(() => {
    const rule: SortRule = {
      id: genId(),
      field: columns[0] ?? '',
      direction: 'asc'
    }
    setSortRules([...sortRules, rule])
  }, [columns, sortRules, setSortRules])

  const updateSortRule = useCallback(
    (id: string, patch: Partial<SortRule>) => {
      setSortRules(sortRules.map(r => (r.id === id ? { ...r, ...patch } : r)))
    },
    [sortRules, setSortRules]
  )

  const removeSortRule = useCallback(
    (id: string) => {
      setSortRules(sortRules.filter(r => r.id !== id))
    },
    [sortRules, setSortRules]
  )

  const selectStyle: React.CSSProperties = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '1px solid var(--vos-border-subtle)',
    borderRadius: 4,
    padding: '2px 4px',
    fontSize: 12,
    outline: 'none'
  }

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
    flex: 1,
    minWidth: 0
  }

  return (
    <div
      className="flex flex-col gap-3 p-3"
      style={{
        background: 'var(--vos-bg-elevated)',
        borderBottom: '1px solid var(--vos-border-subtle)'
      }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
            筛选条件
          </span>
          <button
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-(--vos-bg-hover)"
            style={{ color: 'var(--vos-accent-primary)' }}
            onClick={addCondition}
          >
            <Plus size={12} /> 添加
          </button>
        </div>
        {filterConditions.map(cond => (
          <div key={cond.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={cond.enabled}
              onChange={e => updateCondition(cond.id, { enabled: e.target.checked })}
              className="shrink-0"
            />
            <FormSelect
              value={cond.field}
              onChange={e => updateCondition(cond.id, { field: e.target.value })}
              variant="toolbar"
              wrapperClassName="flex-1"
              style={selectStyle}
            >
              {columns.map(col => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              value={cond.operator}
              onChange={e => updateCondition(cond.id, { operator: e.target.value as FilterOperator })}
              variant="toolbar"
              wrapperClassName="w-[112px] shrink-0"
              style={selectStyle}
            >
              {FILTER_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </FormSelect>
            {!NO_VALUE_OPS.has(cond.operator) && (
              <input
                value={cond.value}
                onChange={e => updateCondition(cond.id, { value: e.target.value })}
                placeholder="值"
                style={inputStyle}
              />
            )}
            <FormSelect
              value={cond.logic}
              onChange={e => updateCondition(cond.id, { logic: e.target.value as 'and' | 'or' })}
              variant="toolbar"
              wrapperClassName="w-[56px] shrink-0"
              style={{ ...selectStyle, width: 56 }}
            >
              <option value="and">AND</option>
              <option value="or">OR</option>
            </FormSelect>
            <button className="shrink-0 p-1 rounded hover:bg-(--vos-bg-hover)" onClick={() => removeCondition(cond.id)}>
              <Trash2 size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
            排序规则
          </span>
          <button
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-(--vos-bg-hover)"
            style={{ color: 'var(--vos-accent-primary)' }}
            onClick={addSortRule}
          >
            <Plus size={12} /> 添加
          </button>
        </div>
        {sortRules.map(rule => (
          <div key={rule.id} className="flex items-center gap-1.5">
            <FormSelect
              value={rule.field}
              onChange={e => updateSortRule(rule.id, { field: e.target.value })}
              variant="toolbar"
              wrapperClassName="flex-1"
              style={{ ...selectStyle, flex: 1 }}
            >
              {columns.map(col => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </FormSelect>
            <FormSelect
              value={rule.direction}
              onChange={e => updateSortRule(rule.id, { direction: e.target.value as 'asc' | 'desc' })}
              variant="toolbar"
              wrapperClassName="w-[92px] shrink-0"
              style={selectStyle}
            >
              <option value="asc">ASC ↑</option>
              <option value="desc">DESC ↓</option>
            </FormSelect>
            <button className="shrink-0 p-1 rounded hover:bg-(--vos-bg-hover)" onClick={() => removeSortRule(rule.id)}>
              <Trash2 size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
            </button>
          </div>
        ))}
      </div>

      <button
        className="self-start px-4 py-1.5 rounded text-xs font-medium text-white"
        style={{ background: 'var(--vos-accent-primary)' }}
      >
        应用筛选 &amp; 排序
      </button>
    </div>
  )
}
