# Archive Editor 改进 - 验收报告

## 验收核查表

### 第一轮需求验收（已完成）

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | zip 文件显示乱码 | `decode_zip_name` 函数支持 GBK/GB18030 回退解码 | 通过 | — | 已实现 |
| 2 | zip 文件显示乱码 | `list_zip` 使用 `name_raw()` 获取原始字节并解码 | 通过 | — | 已实现 |
| 3 | zip 文件显示乱码 | `read_zip_entry` 用同样编码规则匹配 entry name | 通过 | — | 已实现 |
| 4 | zip 文件显示乱码 | 单元测试覆盖 GBK、UTF-8、ASCII 三种编码 | 通过 | — | 3 个新测试 |
| 5 | 单击改为选中 | 单击文件/目录高亮选中 | 通过 | — | `selectedPaths` 状态 + 选中样式 |
| 6 | 单击改为选中 | Ctrl/Cmd+Click 切换单个选中 | 通过 | — | 已实现 |
| 7 | 单击改为选中 | Shift+Click 范围选中 | 通过 | — | `lastClickedPathRef` 锚点 |
| 8 | 单击改为选中 | 双击目录进入子目录 | 通过 | — | 已实现 |
| 9 | 复用文件打开逻辑 | file-viewer 支持 blobUrl 模式 | 通过 | — | `appState.blobUrl` + `fileName` |
| 10 | 复用文件打开逻辑 | 双击文件通过 openWindow 调用 file-viewer | 通过 | — | `openWindow('file-viewer', { appState })` |
| 11 | 右键解压到本地目录 | 右键菜单显示"解压选中项到本地目录" | 通过 | — | 自定义 context menu 组件 |
| 12 | 右键解压到本地目录 | 支持 File System Access API 写入本地目录 | 通过 | — | `showDirectoryPicker` |
| 13 | 右键解压到本地目录 | 不支持浏览器回退为逐个下载 | 通过 | — | `<a>` download 回退 |
| 14 | 整体质量 | `cd native && cargo test -p ventoos-vfs --lib archive` 全部通过 | 通过 | — | 10/10 passed |
| 15 | 整体质量 | `cd native && cargo build` 编译通过 | 通过 | — | 无新增 warning |
| 16 | 整体质量 | `cd web && pnpm build` 构建通过 | 通过 | — | 无错误 |

### 第二轮需求验收（本次）

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | 解压文件名乱码 | `extract_zip` 使用 `decode_zip_name(entry.name_raw())` | 通过 | — | 已修复 |
| 2 | 解压文件名乱码 | 解压后文件名与列表显示一致 | 通过 | — | 测试验证"测试文件.txt" |
| 3 | 解压文件名乱码 | 安全检查：跳过包含 `..` 或绝对路径的条目 | 通过 | — | 已实现 |
| 4 | 双击文件显示"未指定文件" | blobUrl 模式下 guard 不触发 | 通过 | — | `if (!isBlobMode && ...)` |
| 5 | 双击文件显示"未指定文件" | toolbar 显示正确的文件名 | 通过 | — | `fileName ?? '未命名'` |
| 6 | 双击文件显示"未指定文件" | footer 在 blobUrl 模式下不崩溃 | 通过 | — | `node?.size` / `node?.modified` |
| 7 | 右键菜单用系统统一组件 | 移除自定义 ctxMenu div | 通过 | — | 已移除 |
| 8 | 右键菜单用系统统一组件 | 使用 `useContextMenuStore.show()` | 通过 | — | 已实现 |
| 9 | 右键菜单用系统统一组件 | 菜单项为"解压"（非"解压选中项到本地目录"） | 通过 | — | label: '解压' |
| 10 | 解压改为选择 VFS 目录 | 弹出 `VfsFilePickerModal(mode="directory")` | 通过 | — | 已实现 |
| 11 | 解压改为选择 VFS 目录 | 使用 `vfsApi.uploadVfsFile()` 写入目标目录 | 通过 | — | 已实现 |
| 12 | 解压改为选择 VFS 目录 | 支持跨 mount 解压 | 通过 | — | `destMountId` 独立于源 |
| 13 | Explorer 拖动框选 | mousedown 在空白区域启动框选 | 通过 | — | 已实现 |
| 14 | Explorer 拖动框选 | 拖拽过程中显示蓝色选区矩形 | 通过 | — | 绝对定位 overlay |
| 15 | Explorer 拖动框选 | mouseup 时选区内的文件被选中 | 通过 | — | `getBoundingClientRect` 重叠检测 |
| 16 | Explorer 拖动框选 | 框选结果更新 `multiSelect` 状态 | 通过 | — | `onRubberBandSelect` 回调 |
| 17 | 整体质量 | `cargo clippy -p ventoos-vfs` 通过 | 通过 | — | 无新增 error（有 52 个已有 warning） |
| 18 | 整体质量 | `cargo test -p ventoos-vfs test_extract_zip_gbk_filename` 通过 | 通过 | — | 1 passed |
| 19 | 整体质量 | `cd web && pnpm build` 通过 | 通过 | — | built in 3.77s |

## 结论

第二轮 5 项需求全部实现并通过验收：

1. **解压文件名乱码** — `extract_zip` 改用 `name_raw()` + `decode_zip_name()`，解压后文件名与列表一致
2. **双击文件"未指定文件"** — file-viewer blobUrl 模式 guard、toolbar、footer 全部修复
3. **右键菜单统一** — 迁移到系统 `useContextMenuStore`，移除自定义菜单 div
4. **解压目标改为 VFS** — 使用 `VfsFilePickerModal` 选择 VFS 目录，支持跨 mount 解压
5. **Explorer 拖动框选** — ColumnView 新增 rubber-band selection，鼠标框选文件交互
