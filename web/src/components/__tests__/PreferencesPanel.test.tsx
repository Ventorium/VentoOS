import { fireEvent, render, screen } from '@testing-library/react'
import PreferencesPanel from '../PreferencesPanel'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('PreferencesPanel', () => {
  it('uses grouped navigation inside the unified preferences sheet', () => {
    render(
      <PreferencesPanel
        title="测试应用偏好设置"
        onClose={() => {}}
        groups={[
          {
            id: 'general',
            title: '通用',
            items: [
              {
                id: 'hidden-files',
                label: '显示隐藏文件',
                description: '控制文件列表是否显示隐藏项',
                type: 'switch',
                value: true,
                onChange: () => {}
              }
            ]
          },
          {
            id: 'advanced',
            title: '高级',
            items: [
              {
                id: 'sample-text',
                label: '采样说明',
                description: '高级页签里的内容',
                type: 'text',
                value: 'enabled',
                onChange: () => {}
              }
            ]
          }
        ]}
      />
    )

    const dialog = screen.getByRole('dialog', { name: '测试应用偏好设置' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    expect(screen.getByRole('button', { name: '通用' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '高级' })).toBeInTheDocument()
    expect(screen.queryByText('高级页签里的内容')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '高级' }))

    expect(screen.getByText('高级页签里的内容')).toBeInTheDocument()
    expect(screen.queryByText('控制文件列表是否显示隐藏项')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭偏好设置' })).toBeInTheDocument()
  })
})
