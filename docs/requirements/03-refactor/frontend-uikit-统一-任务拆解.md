# 前端 UIKit 统一 - 任务拆解

> 更新时间: 2026-04-22

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 统一全局按钮体系，不能继续混用局部手写按钮写法 | 1.1 基于现有 `.vos-btn` 抽出统一 `Button` 组件<br>1.2 抽出统一 `IconButton` / 工具栏按钮变体 | `web/src/components/ui` 提供统一按钮基座；高频页面不再手写 `rounded text-xs border hover` 按钮 | 已完成 |
| 2 | 统一表单行、标签和控件承载方式 | 2.1 抽出统一 `FormField` / `FormRow` UIKit 组件<br>2.2 支持 label、required、hint、error、布局类透传 | 配置表单、弹窗表单不再依赖页面内 `labelCls` / `rowCls` 重复拼接 | 已完成 |
| 3 | 把新 UIKit 替换到高重复热点，而不是只新增不用 | 3.1 替换 Database 工具栏按钮<br>3.2 替换 Super Terminal 表单与操作按钮<br>3.3 替换 API Client / Settings / 其他代表页面的局部热点 | 至少覆盖 3 个以上高频模块，形成跨应用统一样式 | 已完成 |
| 4 | 保持全局统一样式，不引入新的碎片化写法 | 4.1 在 `app.css` 增加系统级按钮/表单字段样式<br>4.2 UIKit 导出统一入口 | 新组件不依赖页面局部魔法 class 才能成立 | 已完成 |
| 5 | 修复过程中必须保持可访问性与可验证性 | 5.1 补 UIButton / FormField 相关测试<br>5.2 执行前端测试与构建验证 | 相关 Vitest 通过，`cd web && pnpm build` 通过 | 已完成 |

## 功能定位 → 影响层级 → 接口设计

| 功能定位 | 影响层级 | 接口设计 |
|---|---|---|
| 前端系统级 UIKit 收敛 | WebOS Shell / Application Layer 共用的 UI 基座 | 在 `web/src/components/ui` 提供 `Button`、`IconButton`、`FormField`，由应用页面消费 |

## 实施范围

- `web/src/components/ui/`：新增 UIKit 基座与导出
- `web/src/assets/styles/app.css`：补系统级按钮与表单字段样式
- `web/src/apps/database/**`：替换数据库编辑器和设计器中的工具栏按钮热点
- `web/src/apps/super-terminal/**`：替换服务器、端口映射等配置表单的重复表单行与按钮
- `web/src/apps/api-client/**`、`web/src/apps/settings/**`：补齐代表性使用点

## 实际完成范围

- `web/src/components/ui/`：新增 `Button`、`IconButton`、`FormField`、`FormRow`，并统一导出
- `web/src/assets/styles/app.css`：新增工具栏按钮、超小按钮、表单提示与错误语义样式
- `web/src/apps/database/components/SqlEditor.tsx`：工具栏按钮切换到 `Button`
- `web/src/apps/database/components/TableDesigner.tsx`：设计器工具栏与分标签页操作按钮切换到 `Button`
- `web/src/apps/api-client/components/EnvironmentPanel.tsx`：环境操作按钮切换到 `Button`，并修复切换环境后的变量状态复用问题
- `web/src/apps/super-terminal/components/ssh-servers/SshServers.tsx`：编辑弹窗切换到 `FormField` / `Button`，补齐 tab 可访问性
- `web/src/components/ui/ConfirmDialog.tsx`：统一切换到 `Button`
- `web/src/shell/FilePicker/index.tsx`：为组合控件补充 `id` / `aria-describedby` 透传和图标按钮命名

## 约束

- 业务状态不新增持久化需求；本轮仅处理 UIKit 表现层抽象
- 不做无关大规模重构，只替换高重复、可证明收益的热点
- 新组件必须兼容现有 `.vos-*` 设计 token 和主题变量
- 替换后必须通过前端测试与构建验证