# Frontend UIKit Audit

## 已完成的统一项

| 类别 | 统一基座 | 说明 |
|---|---|---|
| 活动栏 | `AppSidebar` | 统一了 VS Code 风格活动栏，修复图标未渲染，并补了可访问名称。 |
| 原生选择框 | `FormSelect` | 提供 `default`、`toolbar`、`minimal` 三类变体，统一箭头、边框、背景和尺寸。 |
| 按钮式下拉 | `DropdownSelect` | 用于 method/environment 这类按钮触发的菜单型选择器，统一触发器、菜单、选中态和关闭行为。 |

## 当前已有的系统级组件

- `AppLayout`
- `Checkbox`
- `ConfirmDialog`
- `DropdownSelect`
- `EmptyState`
- `FormInput` / `FormSelect` / `FormTextarea`
- `Modal`
- `SectionHeader`
- `Spinner`
- `StatusBadge`
- `Tabs`
- `AppSidebar`

## 审计结论

这轮统一后，前端 UIKit 已经有了输入、选择、弹层、空态、状态徽标、分页标签和活动栏等基础能力，但仍然缺少一批高复用、跨应用反复手写的系统级组件。当前最明显的问题不是单个页面样式错误，而是多个应用都在重复拼装同一类控件，导致视觉和交互细节继续漂移。

## 下一批应收敛的高收益组件

| 优先级 | 组件 | 现象 | 代表位置 |
|---|---|---|---|
| P0 | `Button` / `IconButton` / `ToolbarButton` | 仓库内仍有大量手写按钮样式，尤其是工具栏按钮、主按钮、危险按钮和图标按钮，重复使用 `rounded text-xs border hover` 一类组合。 | `web/src/apps/database/components/SqlEditor.tsx`, `web/src/apps/database/components/TableDesigner.tsx`, `web/src/apps/image-editor/index.tsx`, `web/src/apps/settings/index.tsx` |
| P0 | `FormField` / `FormRow` | 表单标签、帮助文本、错误信息、纵横布局目前大多靠页面内局部 class 组合，难以保证跨应用一致。 | `web/src/apps/super-terminal/components/ssh-servers/SshServers.tsx`, `web/src/apps/database/components/ConnectionConfigDialog.tsx`, `web/src/apps/settings/index.tsx` |
| P1 | `SegmentedControl` | 多处存在 tab-like 的轻量切换或工具分组，但没有统一的轻量段控件。 | `web/src/apps/image-editor/index.tsx`, `web/src/apps/settings/index.tsx`, `web/src/apps/monaco-editor/components/ActivityBar.tsx` |
| P1 | `InlineNotice` / `Callout` | 说明、警告、成功提示仍大量以内联背景块或文本色直接拼装，缺少统一语义容器。 | `web/src/apps/settings/index.tsx`, `web/src/apps/database/index.tsx`, `web/src/apps/kubernetes/components/overview/ClusterOverview.tsx` |
| P1 | `ToolbarGroup` | 许多应用自己实现顶部工具栏的间距、边框和分组规则，复用度高但未系统化。 | `web/src/apps/database/components/SqlEditor.tsx`, `web/src/apps/api-client/components/UrlBar.tsx`, `web/src/apps/image-editor/index.tsx` |

## 建议的收敛顺序

1. 先补 `Button` 体系，统一主按钮、默认按钮、幽灵按钮、危险按钮、图标按钮和工具栏按钮。
2. 再补 `FormField` / `FormRow`，让标签、描述、错误态和控件对齐全部脱离页面局部手写。
3. 然后补 `ToolbarGroup` 和 `SegmentedControl`，把编辑器类应用顶部控制条风格收敛。
4. 最后补 `InlineNotice` / `Callout`，统一全局提示语义和密度。

## 这轮替换的工程判断

目前最值得继续推进的是 `Button` 与 `FormField`。这两个组件的覆盖面最大，一旦系统化，能直接减少设置、数据库、图片编辑、SSH、Kubernetes 等多个应用中的重复样式写法，并把“看起来像一个系统”这件事真正落到全局。