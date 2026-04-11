# VentoOS Web — UI Interaction Patterns & Conventions

本文档记录 VentoOS 前端的 UI 交互约定，供 agent 在开发各应用时遵守。

---

## 1. 上下文菜单（右键菜单）

- 所有列表项操作**必须使用右键菜单**，不使用双击编辑、不使用直接右键删除。
- 右键菜单标准结构（常用命令面板示例）：

  ```
  编辑
  复制命令
  ─────────
  删除
  ```

- 项目的单击操作用于选中或执行主操作（如复制命令到剪贴板）。
- 禁止将删除操作绑定到右键点击本身；删除必须通过菜单项触发。
- 右键菜单组件需处理：点击外部关闭、溢出屏幕后位置自动调整。

### 实现参考

`web/src/apps/super-terminal/index.tsx` — `CmdContextMenu` 组件

---

## 2. 添加按钮位置约定

- "添加"（`+`）按钮应放在**面板头部标题右侧、关闭（×）按钮左侧**。
- 不在面板底部显示"+ 添加 xxx"按钮。
- 按钮使用 Lucide `<Plus size={14}/>` 图标，不显示文字。

### 实现参考

`web/src/apps/super-terminal/index.tsx` — `LeftPanelContent` 组件 header 区域

---

## 3. 背景设置约定

- 背景颜色、背景图片、背景透明度等设置为**全局生效**（应用到整个应用容器），不应仅对单个子组件生效。
- 背景相关设置项放在"通用"设置分组，不放在"终端"或其他子模块分组下。
- 背景图片叠加使用绝对定位 `<div>` + `backgroundImage` + `opacity` 方式，不使用 `<img>` 标签。
- 背景颜色作为容器 `backgroundColor` CSS 属性，背景图片作为覆盖层，二者独立控制。

### 实现参考

`web/src/apps/super-terminal/index.tsx` — `SuperTerminalApp` 组件，全局背景图片覆盖层

---

## 4. 文件路径输入与 VFS 文件选择

- 所有需要**文件路径**或**图片 URL** 的输入框，应提供"浏览"按钮，打开 `VfsFilePickerModal` 进行 VFS 文件选择。
- VFS 选取结果（`VfsPickerResult`）需转换为可访问的 HTTP URL：

  ```ts
  `/api/vfs/mounts/${result.mountId}/raw?path=${encodeURIComponent(result.path)}`
  ```

- 输入框仍支持手动输入任意 URL，VFS 选择仅作为辅助入口。
- 选择图片后可在输入框旁显示缩略图预览（`<img style={{ width: 32, height: 32 }} />`）。

### 实现参考

`web/src/apps/super-terminal/index.tsx` — `SettingsPanel` 背景图片设置部分

---

## 5. Shell / 命令选择器约定

- Shell 类型选择使用 **combobox 模式**（`<input list="...">` + `<datalist>`），同时支持下拉选择和手动输入。
- `<datalist>` 中的选项来自后端探测（`detectShells` API），不写死。
- 不使用纯 `<select>` 限制用户只选预设项。

### 实现参考

`web/src/apps/super-terminal/index.tsx` — `SettingsPanel` shell 设置部分  
`web/src/apps/super-terminal/api.ts` — `detectShells`

---

## 6. 编辑器工具栏按钮约定（Monaco Editor）

使用 Monaco Editor 时，工具栏按钮需绑定 `editorRef`（通过 `onMount` 获取）：

| 按钮 | 操作 |
|------|------|
| 保存 | 触发文件下载（`Blob` + `<a>` 元素），文件名使用当前打开文件名 |
| 撤销 | `editor.trigger('', 'undo', null)` |
| 重做 | `editor.trigger('', 'redo', null)` |
| 下载 | 同保存（触发下载） |
| 搜索 | `editor.trigger('', 'actions.find', null)` |

### 实现参考

`web/src/apps/super-terminal/components/ssh-session/SshSession.tsx`

---

## 7. 终端标签页约定

- 所有终端标签页**均显示关闭（×）按钮**，不论是否只有一个标签页。
- 允许关闭所有标签页（关闭最后一个后，组件应处理空状态或关闭整个面板）。
- 不设置"最少保留 1 个标签页"的限制。

### 实现参考

`web/src/apps/super-terminal/components/ssh-session/SshSession.tsx`

---

## 8. 连接状态约定

- SSH Session 等连接型组件，**只在建立连接后才渲染**；不在组件内使用 `useState(false)` 模拟"未连接"状态。
- 如果连接状态需要运行时判断，使用实际连接 API 的返回值，不硬编码。

---

## 9. 功能开发中的空状态

- 尚未实现的功能（如 SFTP 文件树），显示空状态提示，格式举例：

  ```
  文件树暂不支持
  SFTP 功能开发中
  ```

- 空状态区域依然可以提供"刷新"按钮，为将来接入真实数据预留入口。

---

## 10. 服务器监控面板约定

- 监控数据使用**轮询**方式获取（`setInterval`），不使用 WebSocket（除非有推送需求）。
- 轮询间隔：5 秒。
- 只在监控面板**可见时**启动轮询，面板关闭或组件卸载时清除 interval。
- 监控状态存储在组件本地 `useState`，不放入全局 store。

### 实现参考

`web/src/apps/super-terminal/components/ssh-session/SshSession.tsx` — `serverMetrics` state + polling useEffect
