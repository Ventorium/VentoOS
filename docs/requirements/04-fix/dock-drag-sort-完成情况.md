# Dock 图标拖动排序 — 完成情况

## 原始需求

Dock 底部的图标要可以拖动排序应用的顺序。

## 任务完成情况表

| 序号 | 子任务 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|
| 1 | 给 Dock pinned items 添加拖拽能力 | 已完成 | 测试通过 | 使用原生 HTML5 DnD，wrapper div 设置 `draggable` |
| 2 | 实现拖放位置计算（gap index） | 已完成 | 测试通过 | 基于鼠标位置与 item 中心点比较，兼容水平/垂直 |
| 3 | 调用 moveItem 更新顺序并持久化 | 已完成 | 测试通过 | drop 时调用 `dockLayoutStore.moveItem` |
| 4 | 拖拽视觉反馈 | 已完成 | 测试通过 | 拖动时源图标从 DOM 中移除（不占空间），靠 ghost image 跟随鼠标；目标位置显示 `DropPlaceholder`（与图标同尺寸虚线框，内部显示被拖动应用/文件夹图标，padding 4px） |
| 5 | 其他图标让位动画 | 已完成 | 测试通过 | Dock item wrapper 改为 `motion.div` + `layout`，`LayoutGroup` 包裹 items 容器；源元素移除后其他图标自动通过 layout 动画平滑填补空位 |
| 6 | 拖到 Dock 外释放防丢失 | 已完成 | 测试通过 | 全局 `document` 监听 `dragend`，无论 drop 是否成功都重置 `draggingIndex`，防止拖到 Dock 外后源图标消失 |
| 7 | 排除不可拖动项 | 已完成 | 测试通过 | Launchpad / running unpinned / thumbnails 不可拖动 |
| 8 | 测试覆盖 | 已完成 | 测试通过 | 新增 3 个测试用例，全部通过 |
| 6 | 排除不可拖动项 | 已完成 | 测试通过 | Launchpad / running unpinned / thumbnails 不可拖动 |
| 7 | 测试覆盖 | 已完成 | 测试通过 | 新增 3 个测试用例，全部通过 |

## 修改文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `web/src/shell/Dock/index.tsx` | 修改 | 添加拖拽状态、DropPlaceholder 组件、全局 dragend 监听、Framer Motion `layout` 动画、`LayoutGroup` 包裹、替换 items 渲染逻辑、修复 folder popup index bug、修复拖到 Dock 外丢失问题 |
| `web/src/shell/__tests__/Dock.test.tsx` | 修改 | 新增 draggable / non-draggable / moveItem 测试 |
| `docs/requirements/04-fix/dock-drag-sort-任务拆解.md` | 新增 | 任务拆解文档 |
| `docs/requirements/04-fix/dock-drag-sort-完成情况.md` | 新增 | 本文档 |

## 验证命令

```bash
cd web && pnpm build   # ✓ 通过
cd web && pnpm test -- src/shell/__tests__/Dock.test.tsx   # ✓ 285 tests passed
```

## 设计要点

- 使用原生 HTML5 Drag and Drop API，不引入额外依赖。
- 仅 `dockItems`（已固定项）可拖动；运行中但未固定的应用保留在 Dock 尾部，不可拖动。
- Launchpad 按钮和最小化窗口缩略图不可拖动。
- 兼容三种 Dock 位置：`bottom`（水平）、`left`/`right`（垂直）。
- 顺手修复了 folder popup 中 `openFolderIndex`（数字索引）被误用作 `id`（字符串）比较的 bug。
