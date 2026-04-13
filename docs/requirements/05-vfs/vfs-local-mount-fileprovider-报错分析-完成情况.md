# VFS Local Mount FileProvider 报错分析 - 完成情况

## 完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 调用链梳理 | 主 agent | 已完成 | 已定位到 `NSFileProviderManager.add(domain)` | Rust API 本身只是在转发系统错误 |
| 2 | 手动复现 VentoFS register | 主 agent | 已完成 | 直接执行 VentoFS CLI 复现同样的 `-2001/-2014` | 排除前端与 HTTP 包装层影响 |
| 3 | 检查插件注册状态 | 主 agent | 已完成 | `pluginkit` 未发现 `io.ventoos.VentoFS.FileProvider` | 系统未识别该 FileProvider 扩展 |
| 4 | 检查系统日志 | 主 agent | 已完成 | `pkd` 日志明确报 `plug-ins must be sandboxed` | 已得到直接根因证据 |
| 5 | 评估可用性与用户体验 | 主 agent | 已完成 | 结论已形成 | 当前不满足“用户无感”目标 |

## 关键证据

### 1. 业务调用链

后端挂载路径如下：

1. `POST /api/vfs/mounts/:id/local-mount`
2. `LocalMountManager::mount()`
3. `mount_fileprovider()`
4. `fileprovider_impl::register_domain()`
5. `VentoFS register <mount_id> <display_name>`
6. `NSFileProviderManager.add(domain)`

结论：500 发生在 macOS FileProvider 域注册阶段，不是 VFS 远程读写逻辑阶段。

### 2. 手动复现结果

执行：

```bash
$HOME/Library/VentoOS/VentoFS.app/Contents/MacOS/VentoFS register 9b5ad352-a727-4100-9557-53afbf87aa2c TestMount
```

返回：

```text
Error: Error Domain=NSFileProviderErrorDomain Code=-2001 "应用程序目前无法使用。"
UserInfo={..., NSUnderlyingError=... Code=-2014}
```

结论：问题与 REST 接口包装无关，直接来自系统 FileProvider 框架。

### 3. 插件发现状态

执行：

```bash
pluginkit -mvv -p com.apple.fileprovider-nonui
```

未发现：

- `io.ventoos.VentoFS.FileProvider`
- `VentoFS`

对比同机正常项可看到如：

- `com.tencent.xinWeChat.WeChatFileProviderExtension`

结论：系统未把 `VentoFSFileProvider.appex` 认成一个可用的 FileProvider 扩展。

### 4. 系统日志根因

执行：

```bash
/usr/bin/log show --last 10m --predicate 'subsystem == "com.apple.FileProvider" OR process == "fileproviderd" OR eventMessage CONTAINS[c] "VentoFS"' --style compact
```

出现关键日志：

```text
rejecting; Ignoring mis-configured plugin at [...]/VentoFSFileProvider.appex: plug-ins must be sandboxed
```

同时伴随：

```text
No provider found with identifier (null)
getDomainsForProviderIdentifier((null)) failed: NSError: FP -2001 ... Underlying={NSError: FP -2014 ...}
```

结论：根因是当前 `.appex` 被系统判定为配置错误插件，核心问题是没有满足沙盒要求。

## 根因结论

当前 `VentoFS` 扩展不可用的直接原因是：

1. `native/fileprovider/Resources/VentoFS.entitlements` 明确将 `com.apple.security.app-sandbox` 设为 `false`
2. `build.sh` 使用这份 entitlement 对 `.appex` 和 host app 进行 ad-hoc 签名
3. macOS 的 PlugInKit / FileProvider 守护进程拒绝加载该插件，并记录 `plug-ins must be sandboxed`
4. 因为 provider 根本没有成功注册进系统，后续 `NSFileProviderManager.add(domain)` 就返回 `-2001 / -2014`

## 对当前可用性的判断

| 项目 | 判断 | 说明 |
|---|---|---|
| 后端 local-mount API 是否存在 | 是 | 接口与调用链已实现 |
| VentoFS.app 是否已安装 | 是 | 本机存在于 `~/Library/VentoOS/VentoFS.app` |
| VentoFS FileProvider 扩展是否被系统接受 | 否 | `pluginkit` 不可见，系统日志明确拒绝 |
| FileProvider 挂载当前是否可用 | 否 | 当前无法成功注册 domain |

## 对“用户是否无感”的判断

当前结论：**还不够无感，也不够简单。**

原因如下：

1. `check-fileprovider` 目前只检查“是否 macOS 12+ 且 VentoFS.app 存在”，没有检查：
   - 插件是否被 `pluginkit` 识别
   - 插件是否已启用
   - 插件是否满足沙盒/签名要求
   - 是否能实际完成一次 domain 注册
2. UI 在 `fileProviderAvailable === true` 时会提示“扩展已就绪”，但这个判断目前可能是误报
3. 用户仍需要面对：
   - 编译/安装扩展
   - 首次启用系统扩展
   - 系统签名/沙盒约束
   - 挂载失败后的底层系统错误

这意味着当前体验仍是“开发者友好型”，不是“普通用户无感型”。
