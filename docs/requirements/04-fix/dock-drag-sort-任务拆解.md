# Dock 图标拖动排序 — 任务拆解

## 原始需求

Dock 底部的图标要可以拖动排序应用的顺序。

## 需求拆解

| 序号 | 子任务 | 范围 | 依赖 | 交付物 | 验收标准 |
|---|---|---|---|---|---|
| 1 | 给 Dock pinned items 添加拖拽能力 | `web/src/shell/Dock/index.tsx` | 无 | DockIcon/DockFolderIcon wrapper 支持 drag | 长按/拖动图标可触发 dragstart |
| 2 | 实现拖放位置计算（gap index） | `web/src/shell/Dock/index.tsx` | 子任务 1 | 根据鼠标位置计算目标 gap | 水平/垂直 Dock 均能正确计算插入位置 |
| 3 | 调用 moveItem 更新顺序并持久化 | `web/src/shell/Dock/index.tsx` | 子任务 2 | drop 时调用 store.moveItem | 排序后刷新页面顺序保持不变 |
| 4 | 拖拽视觉反馈 | `web/src/shell/Dock/index.tsx` + `app.css` | 子任务 1 | 半透明图标 + gap indicator | 拖动时图标半透明，目标位置有指示条 |
| 5 | 排除不可拖动项 | `web/src/shell/Dock/index.tsx` | 子任务 1 | Launchpad / running unpinned / thumbnails 不可拖动 | 这些项无法触发 dragstart |
| 6 | 测试覆盖 | `web/src/shell/__tests__/Dock.test.tsx` | 子任务 3 | 新增拖拽相关测试 | 测试通过 |

## 设计约束

- 使用原生 HTML5 Drag and Drop API，不引入新依赖。
- 仅 `dockItems`（已固定项）可拖动；`runningUnpinned`（运行中但未固定）不可拖动。
- Launchpad 按钮始终在最前，不可拖动。
- Minimized thumbnails 不可拖动。
- 兼容三种 Dock 位置：`bottom`（水平）、`left`/`right`（垂直）。
- `dockLayoutStore.moveItem` 已存在，直接复用。
