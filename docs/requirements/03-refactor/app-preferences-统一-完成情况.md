# 应用偏好设置统一 - 完成情况

> 更新时间: 2026-04-22

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 将 AppPreferences 改为应用内 top sheet 基座 | 主 agent | 已完成 | `pnpm vitest run src/components/__tests__/PreferencesPanel.test.tsx src/apps/ssh/__tests__/ResourceMonitorPanel.test.tsx` 通过 | 偏好设置弹层改为应用窗口内顶部固定覆盖层，补齐 `role="dialog"`、`aria-modal`、Esc 关闭和关闭按钮命名 |
| 2 | 把旧 PreferencesPanel 改成兼容层 | 主 agent | 已完成 | `PreferencesPanel.test.tsx` 通过 | 旧 `PreferenceGroup[]` 结构不再维护第二套弹框实现，统一适配到 `AppPreferencesSheet` |
| 3 | 替换 Explorer 的局部偏好设置弹框 | 主 agent | 已完成 | 编辑器诊断无错误，`pnpm build` 通过 | Explorer 从局部 `Modal` 改为统一偏好设置页签，保留隐藏文件与 WebDAV 共享设置 |
| 4 | 平滑接入 monitor / ssh 偏好设置 | 主 agent | 已完成 | `PreferencesPanel.test.tsx` 通过 | monitor 与 ssh 继续使用原有配置数据结构，但底层已切换到统一偏好设置体系 |
| 5 | 保持既有偏好持久化链路 | 主 agent | 已完成 | `pnpm build` 通过 | monitor、ssh、explorer 仍沿用原 `useAppStorage` / store 写入路径，未新增页面内唯一状态源 |
| 6 | 修复相关构建阻塞并完成验证 | 主 agent | 已完成 | `pnpm build`、`cargo clippy`、`cargo build` 已执行 | 顺带修复 Explorer / file-icons 的本地 TS 问题，确保本轮改动可构建 |

## 实现详情

### 1. 偏好设置基座统一

- `web/src/components/AppPreferences/index.tsx`：将偏好设置容器从居中 modal 风格改为应用窗口内 top sheet；同步修复类别切换、标题命名和可访问性语义。
- `web/src/components/PreferencesPanel.tsx`：改为兼容层，把旧 `PreferenceGroup[]` 映射到 `AppPreferencesSheet`，避免 monitor / ssh 大面积重写。

### 2. 应用侧替换

- `web/src/apps/explorer/index.tsx`：删除局部 `ExplorerSettingsDialog`，改为 `ExplorerSettingsSheet`，统一到“通用 / WebDAV”分类偏好设置。
- `web/src/apps/ssh/index.tsx`：应用根节点改为 `relative`，确保应用作用域内弹层有稳定锚点。
- `web/src/apps/monitor/index.tsx`：继续使用旧 `PreferencesPanel` API，但渲染底座已统一到共享偏好设置基座。

### 3. 相关回补

- `web/src/kernel/apps/file-icons.ts`：放宽图标组件类型，允许 `className`，消除 Explorer 接入新偏好设置后暴露出的 TS 阻塞。
- `web/src/apps/explorer/index.tsx`：修正 `File` 图标命名冲突、移除未使用变量和导入，消除本轮改动路径上的构建噪音。

## 验证命令执行结果

| 命令 | 结果 |
|---|---|
| `cd web && pnpm vitest run src/components/__tests__/PreferencesPanel.test.tsx src/apps/ssh/__tests__/ResourceMonitorPanel.test.tsx` | ✓ 2/2 通过 |
| `cd web && pnpm build` | ✓ 通过 |
| `cd native && cargo clippy` | ✓ 命令通过；native 现有 crate 仍有既有 warning，本轮未触碰后端代码 |
| `cd native && cargo build` | ✓ 通过 |

## 文件清单

### 新增文件

- `web/src/components/__tests__/PreferencesPanel.test.tsx`
- `web/src/apps/ssh/__tests__/ResourceMonitorPanel.test.tsx`

### 修改文件

- `web/src/components/AppPreferences/index.tsx`
- `web/src/components/PreferencesPanel.tsx`
- `web/src/apps/explorer/index.tsx`
- `web/src/apps/monitor/index.tsx`
- `web/src/apps/ssh/index.tsx`
- `web/src/kernel/apps/file-icons.ts`