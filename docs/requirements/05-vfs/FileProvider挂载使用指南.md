# VentoOS FileProvider 挂载使用指南

> 适用系统：macOS 12 Monterey 及以上

## 概述

VentoOS 支持两种 VFS 挂载后端：

| 后端 | 方式 | 依赖 | 适合场景 |
|------|------|------|---------|
| **macFUSE (Fuse)** | 内核扩展挂载，文件路径可自定义 | 需安装 macFUSE | 需要通过路径访问、与工具链集成 |
| **Apple FileProvider** | 系统级扩展，Finder 侧边栏直接显示 | 需编译 VentoFS.app | 日常 Finder 访问、无需 root 权限 |

---

## 方式一：macFUSE（默认）

### 前置条件

1. 安装 [macFUSE](https://osxfuse.github.io/)
2. macOS 重启后在「系统偏好设置 → 安全性与隐私」允许内核扩展

### 使用步骤

1. 打开 VentoOS → 点击 Dock 中的「资源管理器」图标
2. 点击「添加挂载点」
3. **后端选择**：保持默认 `macFUSE`
4. 填写：
   - 挂载名称（自定义显示名）
   - 远程连接（选择已配置的 SSH/SFTP 等连接）
   - 远程路径（如 `/home/user`）
   - 本地挂载路径（如 `/tmp/my-server`）
5. 点击「确认挂载」

挂载成功后，可直接通过 `/tmp/my-server` 访问远程文件系统。

---

## 方式二：Apple FileProvider

无需安装第三方内核扩展，远程文件系统以「网络位置」形式出现在 Finder 侧边栏中。

### 前置条件

1. **macOS 12 Monterey+**
2. **安装 Xcode 命令行工具**（仅首次需要）：
   ```bash
   xcode-select --install
   ```
3. **编译并安装 VentoFS.app**：
   ```bash
   cd native/fileprovider
   make build    # 编译
   make install  # 安装到 ~/Library/VentoOS/
   ```
   安装后 macOS 会自动注册 FileProvider 扩展，无需重启。

### 使用步骤

1. 打开 VentoOS → 点击 Dock 中的「资源管理器」图标
2. 点击「添加挂载点」
3. **后端选择**：切换为 `Apple FileProvider`
   - 若系统不满足要求（macOS < 12），此选项会被禁用并提示原因
4. 填写：
   - 挂载名称（将显示在 Finder 侧边栏）
   - 远程连接
   - 远程路径
   - ⚠️ 本地挂载路径**无需填写**（系统自动管理位置）
5. 点击「确认挂载」

挂载成功后，打开 Finder，在左侧边栏「位置」分组下可以看到对应的远程文件系统。

### 取消挂载

在 VentoOS 资源管理器中点击挂载项旁的「卸载」按钮，FileProvider domain 会自动从 Finder 侧边栏移除。

---

## 检查 FileProvider 可用性

VentoOS 会在挂载对话框打开时自动检测 FileProvider 是否可用，并给出提示。

也可通过接口手动检查：

```
GET http://localhost:5454/api/mount/check-fileprovider
```

返回示例：
```json
{
  "available": true,
  "reason": null,
  "macos_version": "14.3.1"
}
```

| 字段 | 说明 |
|------|------|
| `available` | 是否支持 FileProvider 挂载 |
| `reason` | 不可用时的原因（如 `"macOS < 12.0"` 或 `"not macOS"`） |
| `macos_version` | 当前系统版本 |

---

## 常见问题

### Q: 两种后端可以同时使用吗？
A: 可以。每个挂载点独立选择后端，互不影响。

### Q: FileProvider 挂载后 Finder 里看不到？
A: 确认 VentoFS.app 已通过 `make install` 安装，并且 VentoOS 服务正在运行（端口 5454）。

### Q: 修改了挂载后端后需要重新挂载吗？
A: 是的，修改后端类型需要先卸载再重新挂载。

### Q: FileProvider 挂载的文件存在哪里？
A: 由 macOS FileProvider 框架管理，通常缓存在 `~/Library/CloudStorage/` 或系统管理的沙盒路径下，用户无需关心具体位置，通过 Finder 直接访问即可。

### Q: 切换后端后旧的数据库记录是否兼容？
A: 是的。旧记录没有 `backend` 字段时默认使用 `macFUSE` 后端，不会影响现有挂载。

---

## 架构说明

```
VentoOS Web UI
    │  选择 backend=FileProvider
    ↓
Rust Server (POST /api/mount)
    │  MountBackend::FileProvider
    ↓
fileprovider_impl::register_domain()
    │  调用 VentoFS.app CLI
    ↓
macOS FileProvider.framework
    │  注册 Domain: io.ventoos.vfs.<mount_id>
    ↓
VentoFS Extension (.appex)
    │  HTTP 调用 VentoOS VFS API
    ↓
Finder 侧边栏显示远程文件系统
```
