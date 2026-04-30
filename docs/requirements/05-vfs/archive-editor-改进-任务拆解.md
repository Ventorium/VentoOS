# Archive Editor 改进 - 任务拆解

## 原始需求来源

### 第一轮（2026-04-30）

用户提出的 4 条改进需求（已完成）。

### 第二轮（2026-04-30）

用户在第一轮实现后发现的 5 条问题/改进：

1. 解压出来的文件中文文件名仍然是乱码（列出正常但解压不正常）
2. 在解压预览时双击文件显示"未指定文件"
3. 右键菜单应使用系统统一的 ContextMenu store
4. "解压选中项到本地目录"改为"解压"，解压目标改为 Explorer VFS 目录（支持任意源）
5. Explorer 要支持拖动框选（rubber-band selection）

---

## 第二轮需求拆解

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 解压文件名乱码 | `extract_zip` 使用 `name_raw()` + `decode_zip_name()` 替代 `enclosed_name()` | 解压后的文件名与列表显示一致 | 已完成 |
| 2 | 双击文件显示"未指定文件" | file-viewer blobUrl 模式下修复空状态 guard 和 toolbar/footer 安全访问 | blobUrl 模式下双击正常打开文件 | 已完成 |
| 3 | 右键菜单用系统统一组件 | 移除自定义 ctxMenu div，改用 `useContextMenuStore.show()` | 右键菜单样式与系统一致 | 已完成 |
| 4 | 解压改为选择 VFS 目录 | 移除 File System Access API，改用 `VfsFilePickerModal(mode="directory")` + `vfsApi.uploadVfsFile()` | 解压目标为 Explorer 任意 VFS 目录 | 已完成 |
| 5 | Explorer 拖动框选 | ColumnView 新增 rubber-band selection（mousedown/mousemove/mouseup） | 鼠标在空白区域拖拽可框选文件 | 已完成 |

---

## 实现顺序

### 阶段一：Rust 后端解压乱码修复（需求 1）
- `extract_zip` 中 `entry.enclosed_name()` → `entry.name_raw()` + `decode_zip_name()`
- 添加 PathBuf import
- 编写 GBK 编码 zip 解压测试

### 阶段二：file-viewer blobUrl 模式修复（需求 2）
- 修复空状态 guard 条件：`if (!isBlobMode && (!mountId || !node))`
- toolbar 文件名使用 `fileName ?? '未命名'`
- footer 使用 `node?.size` / `node?.modified` 安全访问

### 阶段三：archive-editor 右键菜单迁移 + 解压目标改造（需求 3 + 4）
- 移除自定义 ctxMenu 状态和 JSX
- 使用 `useContextMenuStore.show()` 显示系统菜单
- 解压目标从 File System Access API 改为 `VfsFilePickerModal(mode="directory")`
- 解压逻辑改用 `vfsApi.readArchiveEntry()` + `vfsApi.uploadVfsFile()`

### 阶段四：Explorer 拖动框选（需求 5）
- ColumnView 新增 rubber-band 状态和事件处理
- mousedown 在空白区域启动框选
- mousemove 更新选区矩形
- mouseup 根据矩形与 entry 元素的重叠计算选中项
- 调用 `onRubberBandSelect` 回调更新父组件 `multiSelect`
