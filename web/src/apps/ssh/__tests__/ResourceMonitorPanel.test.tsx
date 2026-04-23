import { render, waitFor } from '@testing-library/react'
import ResourceMonitorPanel from '../ResourceMonitorPanel'
import { sshApi } from '../api'

vi.mock('../api', () => ({
  sshApi: {
    getServerMetrics: vi.fn()
  }
}))

describe('ResourceMonitorPanel', () => {
  it('keeps the side divider on the subtle border token', async () => {
    vi.mocked(sshApi.getServerMetrics).mockResolvedValue({
      data: {
        cpu_usage: 18,
        memory_used: 4_000_000_000,
        memory_total: 8_000_000_000,
        disks: [{ name: '/', used: 12_000_000_000, total: 32_000_000_000 }]
      }
    })

    const { container } = render(<ResourceMonitorPanel serverId="ssh-1" onClose={() => {}} />)

    await waitFor(() => expect(sshApi.getServerMetrics).toHaveBeenCalledWith('ssh-1'))

    expect(container.firstElementChild?.getAttribute('style')).toContain('border-left: 1px solid var(--vos-border-subtle)')
  })
})