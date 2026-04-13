# VFS Local Mount FileProvider 修复与无感化 - 完成情况

## 完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 修正 VentoFS 扩展 sandbox 配置 | 主 agent | 已完成 | 重新构建安装后不再出现 `plug-ins must be sandboxed` | `VentoFS.entitlements` 已开启 sandbox |
| 2 | 去除本地开发版对 App Group 的硬依赖 | 主 agent | 已完成 | 不再出现 App Group 拒绝导致的注册失败 | 当前改为直接走 socket / localhost |
| 3 | 修正 Rust 侧调用方式 | 主 agent | 已完成 | `register/status/unregister` 通过 app bundle 返回 `ok/active/ok` | 不再直接执行 app 内二进制 |
| 4 | 后端 FileProvider 诊断增强 | 主 agent | 已完成 | `check-fileprovider` 升级为结构化诊断 + 注册探针 | 新增真实探针逻辑 |
| 5 | 前端安装与提示增强 | 主 agent | 已完成 | UI 已改为使用结构化诊断，不再只看布尔值 | 未执行前端构建，环境缺少 node |
| 6 | 防止“假成功”挂载 | 主 agent | 已完成 | 挂载成功前要求 CloudStorage 路径可访问，否则回滚 | 避免用户看到挂上但不可读 |
| 7 | Rust 测试与构建 | 主 agent | 已完成 | `cargo test -p ventoos-mount`、`cargo build -p ventoos-server` 通过 | 仓库内仍有既有 warning |

## 关键实现

### 1. 扩展运行方式修正

原先 Rust 通过直接执行：

```text
VentoFS.app/Contents/MacOS/VentoFS
```

来调用 `NSFileProviderManager.add(domain)`。

这会导致系统侧出现：

- `calling bundle (null)`
- `No provider found with identifier (null)`

现已改为：

- Rust 通过 `open -nW <VentoFS.app> --args ...` 启动真正的 app bundle
- Swift `main.swift` 将结果写入 app container 内的临时结果文件
- Rust 读取结果文件作为返回值

这样系统可以把调用与宿主 app bundle 正确关联起来。

### 2. 结构化诊断

新增 `FileProviderAvailability`，包含：

- `available`
- `probe_succeeded`
- `app_installed`
- `helper_binary_exists`
- `plugin_registered`
- `reason`
- `details`

后端新增两层检查：

1. 同步前置检查：平台 / app / helper
2. 异步健康检查：临时 `register + unregister`

### 3. 用户无感化保护

为了避免“系统返回 active，但 Finder 实际读不动”的假阳性，又补了一层：

- 注册成功后，必须检查 `~/Library/CloudStorage/VentoFS-<displayName>` 是否真正可访问
- 如果路径不可访问或访问超时，则认为 FileProvider 仍不可用
- 对实际挂载请求会主动回滚 `unregister`

这让用户不会看到“已就绪/已挂载”但实际打不开的状态。

## 实际验证结果

### 1. 已通过

手动通过 app bundle 调用：

```text
register -> ok
status -> active
unregister -> ok
```

说明：

- sandbox / app bundle 启动链路已修通
- domain 注册生命周期可正常跑通

### 2. 仍存在的运行态风险

尽管 domain 注册成功，系统日志仍出现：

```text
NSFileProviderErrorDomain Code=-2011
“(null)”未启用同步
```

并且在注册期间访问：

```text
~/Library/CloudStorage/VentoFS-TestMount
```

仍可能失败或超时。

因此本轮代码已将这类情况纳入“不可用”判断，不会再把它当成就绪态返回给前端或挂载流程。

## 涉及文件

- `native/crates/ventoos-mount/src/types.rs`
- `native/crates/ventoos-mount/src/manager.rs`
- `native/crates/ventoos-mount/src/fileprovider_impl.rs`
- `native/crates/ventoos-mount/src/validate.rs`
- `native/crates/ventoos-server/src/deps.rs`
- `native/fileprovider/Sources/main.swift`
- `native/fileprovider/Sources/VentoAPIClient.swift`
- `native/fileprovider/Resources/Extension-Info.plist`
- `native/fileprovider/Resources/VentoFS.entitlements`
- `web/src/apps/explorer/api.ts`
- `web/src/apps/explorer/index.tsx`
