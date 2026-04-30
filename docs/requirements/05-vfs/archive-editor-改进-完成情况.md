# Archive Editor 改进 - 完成情况

## 原始需求与拆解表（第二轮）

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 解压文件名乱码 | `extract_zip` 使用 `name_raw()` + `decode_zip_name()` | 解压后的文件名与列表显示一致 | 已完成 |
| 2 | 双击文件显示"未指定文件" | file-viewer blobUrl 模式 guard/toolbar/footer 修复 | blobUrl 模式下正常打开文件 | 已完成 |
| 3 | 右键菜单用系统统一组件 | 迁移到 `useContextMenuStore` | 右键菜单样式与系统一致 | 已完成 |
| 4 | 解压改为选择 VFS 目录 | `VfsFilePickerModal(mode="directory")` + VFS upload | 解压目标为 VFS 任意目录 | 已完成 |
| 5 | Explorer 拖动框选 | ColumnView rubber-band selection | 鼠标框选文件 | 已完成 |

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | Rust extract_zip GBK 编码修复 | 主 agent | 已完成 | `cargo test -p ventoos-vfs test_extract_zip_gbk_filename` 通过 | `entry.enclosed_name()` → `name_raw()` + `decode_zip_name()` |
| 2 | file-viewer blobUrl 模式修复 | 主 agent | 已完成 | `pnpm build` 通过 | guard 条件 + toolbar/footer 安全访问 |
| 3 | archive-editor 右键菜单迁移 | 主 agent | 已完成 | `pnpm build` 通过 | 自定义 div → `useContextMenuStore` |
| 4 | 解压目标改为 VFS 目录 | 主 agent | 已完成 | `pnpm build` 通过 | File System Access API → VfsFilePickerModal + uploadVfsFile |
| 5 | Explorer 拖动框选 | 主 agent | 已完成 | `pnpm build` 通过 | ColumnView 新增 rubber-band mousedown/move/up |
| 6 | GBK 解压单元测试 | 主 agent | 已完成 | `cargo test -p ventoos-vfs test_extract_zip_gbk_filename` 通过 | 创建 GBK 编码 zip → 解压 → 验证文件名 |

## 实现说明

### 需求 1：解压文件名乱码

- **文件**：`native/crates/ventoos-vfs/src/archive.rs`
- **问题**：`extract_zip` 使用 `entry.enclosed_name()`（CP437 解码），而 `list_zip` / `read_zip_entry` 使用 `entry.name_raw()` + `decode_zip_name()`（GB18030 回退），导致列表正常但解压乱码
- **修复**：`extract_zip` 改用 `decode_zip_name(entry.name_raw())` 获取文件名，增加 `..` 和绝对路径安全检查
- **测试**：`test_extract_zip_gbk_filename` — 创建 zip 后 patch UTF-8 flag 模拟 GBK 编码，解压后验证文件名为"测试文件.txt"

### 需求 2：双击文件显示"未指定文件"

- **文件**：`web/src/apps/file-viewer/index.tsx`
- **问题**：空状态 guard `if (!mountId || !node)` 在 blobUrl 模式下也触发，导致显示"未指定文件"
- **修复**：
  - guard 条件改为 `if (!isBlobMode && (!mountId || !node))`
  - toolbar 文件名使用 `fileName ?? '未命名'`（`fileName = externalFileName ?? node?.name`）
  - footer 使用 `node?.size` / `node?.modified` 可选链防止 blobUrl 模式下崩溃

### 需求 3 + 4：右键菜单迁移 + 解压目标改造

- **文件**：`web/src/apps/archive-editor/index.tsx`
- **问题**：
  - 自定义 ctxMenu div 样式不统一
  - 解压使用 File System Access API（浏览器兼容性差，只能写入本地文件系统）
- **修复**：
  - 移除 `ctxMenu` 状态、`closeCtxMenu` 回调、click-outside useEffect、自定义菜单 JSX
  - 改用 `useContextMenuStore.show(x, y, [{ id: 'extract', label: '解压', action: ... }])`
  - 解压目标改为 `VfsFilePickerModal(mode="directory")` 选择 VFS 目录
  - 解压逻辑改为 `vfsApi.readArchiveEntry()` → `new File([blob], fileName)` → `vfsApi.uploadVfsFile(destMountId, destPath, file)`
  - 支持跨 mount 解压（源和目标可以是不同 VFS mount）

### 需求 5：Explorer 拖动框选

- **文件**：`web/src/apps/explorer/index.tsx`
- **方案**：
  - ColumnView 新增 `onRubberBandSelect(colIndex, entryNames)` 回调 prop
  - `handleRubberBandMouseDown`：mousedown 在空白区域（非 `[data-vfs-entry]` 元素）启动框选，记录起始 Y 坐标（考虑滚动偏移）
  - useEffect 监听全局 mousemove/mouseup：
    - mousemove 更新 `currentY`
    - mouseup 计算选区矩形，遍历 column 内 `[data-vfs-entry]` 元素的 `getBoundingClientRect()` 判断重叠，收集选中 entry names
  - 框选视觉反馈：绝对定位的半透明蓝色矩形 overlay
  - 父组件 `handleRubberBandSelect` 更新 `multiSelect` Map 和 `activeColumn`

## 验证命令

```bash
cd native && cargo test -p ventoos-vfs test_extract_zip_gbk_filename
cd native && cargo clippy -p ventoos-vfs
cd web && pnpm build
```
