import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { confirmMock, toastMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../hooks/useResourceList', () => ({
  useResourceList: vi.fn()
}))

vi.mock('../api', () => ({
  k8sApi: {
    deleteK8sResource: vi.fn()
  }
}))

vi.mock('@/components/Toast', () => ({
  toast: toastMock
}))

vi.mock('../components/resource-list/ResourceToolbar', () => ({
  ResourceToolbar: ({ selectedCount, onDeleteSelected }: { selectedCount: number; onDeleteSelected?: () => void }) => (
    <div>
      <span data-testid="selected-count">{selectedCount}</span>
      <button type="button" onClick={onDeleteSelected}>Delete selected</button>
    </div>
  )
}))

vi.mock('../components/resource-list/ResourceTable', () => ({
  ResourceTable: ({ onSelectChange }: { onSelectChange: (selected: Set<string>) => void }) => {
    useEffect(() => {
      onSelectChange(new Set(['pod-a', 'pod-b']))
    }, [onSelectChange])

    return <div data-testid="resource-table">resource-table</div>
  }
}))

import { k8sApi } from '../api'
import { useResourceList } from '../hooks/useResourceList'
import { ResourceList } from '../components/resource-list/ResourceList'

describe('ResourceList batch delete', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', confirmMock)
    confirmMock.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    vi.mocked(k8sApi.deleteK8sResource).mockReset()
    vi.mocked(useResourceList).mockReturnValue({
      resources: [
        { name: 'pod-a', namespace: 'default', kind: 'Pod' },
        { name: 'pod-b', namespace: 'default', kind: 'Pod' }
      ],
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined)
    })
  })

  it('confirms and deletes all selected resources', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useResourceList).mockReturnValue({
      resources: [
        { name: 'pod-a', namespace: 'default', kind: 'Pod' },
        { name: 'pod-b', namespace: 'default', kind: 'Pod' }
      ],
      loading: false,
      error: null,
      refetch
    })
    confirmMock.mockReturnValue(true)
    vi.mocked(k8sApi.deleteK8sResource).mockResolvedValue({ data: null } as never)

    render(<ResourceList clusterId="cluster-1" namespace="default" kind="pod" />)

    await waitFor(() => expect(screen.getByTestId('selected-count')).toHaveTextContent('2'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))

    await waitFor(() => expect(k8sApi.deleteK8sResource).toHaveBeenCalledTimes(2))
    expect(k8sApi.deleteK8sResource).toHaveBeenNthCalledWith(1, 'cluster-1', 'pod', 'pod-a', 'default')
    expect(k8sApi.deleteK8sResource).toHaveBeenNthCalledWith(2, 'cluster-1', 'pod', 'pod-b', 'default')
    expect(refetch).toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalled()
  })
})
