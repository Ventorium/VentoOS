# 前端 UIKit 统一 - 完成情况

> 更新时间: 2026-04-22

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 抽 Button / IconButton 基座 | 主 agent | 已完成 | `pnpm vitest run src/components/ui/__tests__/Button.test.tsx` 通过 | 基于现有 `.vos-btn` / `.vos-icon-btn` 封装，补齐工具栏与超小尺寸变体 |
| 2 | 抽 FormField / FormRow 基座 | 主 agent | 已完成 | `pnpm vitest run src/components/ui/__tests__/Button.test.tsx` 通过 | 支持 label、required、hint、error，并建立 `aria-describedby` 关联 |
| 3 | 替换 Database 高重复按钮热点 | 主 agent | 已完成 | 编辑器诊断无错误，`pnpm build` 通过 | 覆盖 `SqlEditor`、`TableDesigner` 多处工具栏和操作按钮 |
| 4 | 替换 API Client 环境面板热点 | 主 agent | 已完成 | `pnpm vitest run src/apps/api-client/components/__tests__/EnvironmentPanel.test.tsx` 通过 | 统一按钮后，修复变量行在切换环境时的状态串台 |
| 5 | 替换 Super Terminal 服务器表单热点 | 主 agent | 已完成 | 编辑器诊断无错误，`pnpm build` 通过 | `SshServers` 编辑弹窗改为 `FormField` / `Button`，补齐标签与 tabs 键盘语义 |
| 6 | 扩展共享组件与组合控件语义链 | 主 agent | 已完成 | `pnpm build` 通过 | `ConfirmDialog` 改用 `Button`；`PathPickerInput` 支持 `id` 和 `aria-describedby` |
| 7 | 复审、回归测试与构建验收 | 主 agent | 已完成 | 7 个测试文件 47 个测试全部通过；前端构建通过；native `cargo clippy` / `cargo build` 已执行 | 过程中两轮 code review 发现的可访问性与状态问题已全部回补 |

## 实现详情

### 1. UIKit 基座

- 新增 `web/src/components/ui/Button.tsx`：统一 `Button` / `IconButton`，封装按钮变体、尺寸和装饰图标可访问性。
- 新增 `web/src/components/ui/FormField.tsx`：统一 `FormField` / `FormRow`，封装标签、必填态、提示、错误与语义关联。
- 修改 `web/src/components/ui/index.ts`：统一导出新基座。
- 修改 `web/src/assets/styles/app.css`：新增 `vos-btn-toolbar`、`vos-btn-xs`、`vos-form-hint` 等系统样式。

### 2. 热点替换

- `web/src/apps/database/components/SqlEditor.tsx`：运行、停止、保存、美化等按钮改用 `Button`。
- `web/src/apps/database/components/TableDesigner.tsx`：字段、索引、外键、唯一键、检查、触发器、复制等按钮改用 `Button`。
- `web/src/apps/api-client/components/EnvironmentPanel.tsx`：环境创建、变量保存、添加变量按钮改用 `Button`，并修复局部 state 复用问题。
- `web/src/apps/super-terminal/components/ssh-servers/SshServers.tsx`：服务器编辑表单统一用 `FormField`，相关 footer / toolbar / 空状态按钮统一用 `Button`。
- `web/src/components/ui/ConfirmDialog.tsx`：共享确认弹窗改用 `Button`。

### 3. 可访问性回补

- `Button` 的装饰图标设为 `aria-hidden`，避免污染按钮名称。
- `IconButton` 在类型层强制要求 `aria-label`。
- `SshServers` tabs 增加 `tablist` / `tab` / `tabpanel`、roving tabindex 和方向键切换。
- `FilePicker` 图标按钮补充可访问名称。
- `PathPickerInput` 透传 `id` / `aria-describedby`，让 `FormField` 的语义链可以覆盖组合控件。

### 4. 复审与回补记录

- 第一次 review 发现 4 个问题：EnvironmentPanel 状态串台、FormField 标签链不完整、IconButton 无名称风险、active environment 缺少状态语义。已全部修复。
- 第二次 review 发现 3 个剩余问题：FilePicker 无名称图标按钮、SshServers tabs 键盘语义不完整、FormField `describedby` 链未覆盖组合控件。已全部修复。
- 最终复审结论：未发现明确缺陷。

## 验证命令执行结果

| 命令 | 结果 |
|---|---|
| `cd web && pnpm vitest run src/components/ui/__tests__/Button.test.tsx src/components/ui/__tests__/DropdownSelect.test.tsx src/apps/api-client/components/__tests__/EnvironmentPanel.test.tsx src/apps/api-client/__tests__/store.test.ts src/apps/api-client/utils/__tests__/mappers.test.ts src/apps/api-client/utils/__tests__/runtime.test.ts src/apps/api-client/utils/__tests__/curl.test.ts` | ✓ 7 个测试文件、47 个测试全部通过 |
| `cd web && pnpm build` | ✓ 通过；存在 Vite/rolldown 插件性能与 `esbuild` 配置弃用 warning，不影响本轮改动验收 |
| `cd native && cargo clippy` | ✓ 命令通过；native 现有 crate 存在多处既有 clippy warning，本轮未触碰后端代码 |
| `cd native && cargo build` | ✓ 通过；存在既有 dead code / unused warning |