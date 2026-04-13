# VFS Local Mount FileProvider 修复与无感化 - 验收报告

## 验收核查表

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | 修复扩展不可用 | 是否解决 `plug-ins must be sandboxed` 阻塞 | 通过 | 无 | sandbox 问题已解决 |
| 2 | 修复扩展不可用 | 是否解决 App Group / ad-hoc 直接阻塞注册的问题 | 通过 | 无 | 去掉本地开发版对 App Group 的硬依赖 |
| 3 | 修复扩展不可用 | 是否能成功完成 register/status/unregister | 通过 | 无 | 已验证 `ok/active/ok` |
| 4 | 用户尽量无感 | 是否不再用“文件存在”冒充可用 | 通过 | 无 | 现在使用结构化诊断 + 注册探针 |
| 5 | 用户尽量无感 | 是否能阻止“已挂载但不可访问”的假成功 | 通过 | 无 | 新增 CloudStorage 可访问性探针 |
| 6 | 最终用户可用性 | Finder / CloudStorage 路径是否稳定可读 | 不通过 | 需要继续追查 `FP -2011` | 运行态仍有 sync enabled 问题 |

## 验收结论

### 已完成部分

本轮已经完成两件关键事情：

1. **把 FileProvider 扩展从“根本注册不起来”修到“可以完成 domain 注册生命周期”**
2. **把安装/诊断/提示从“猜测式”改成“探针式”**

因此相比上一轮，系统状态已经从：

- 完全不可用
- 错误点停留在扩展装载阶段

变成了：

- 注册链路可用
- 但内容同步 / CloudStorage 访问层仍存在运行态错误

### 当前产品结论

| 维度 | 结论 |
|---|---|
| 扩展安装链路 | 已显著修复 |
| 诊断准确性 | 已显著提升 |
| 用户误导风险 | 已显著降低 |
| Finder 实际可用性 | 仍未完全验收通过 |

### 当前残余问题

系统日志中仍可见：

```text
NSFileProviderErrorDomain Code=-2011
“(null)”未启用同步
```

这会导致：

- `~/Library/CloudStorage/VentoFS-<displayName>` 虽可能出现
- 但目录访问仍可能失败或超时

所以当前代码已经把这种状态认定为“不可用”，避免用户无感路径被误判为成功。

## 实际执行的验证命令

```bash
cd native && cargo test -p ventoos-mount -- --nocapture
cd native && cargo build -p ventoos-server

cd native/fileprovider && ./build.sh build && ./build.sh install

open -nW "$HOME/Library/VentoOS/VentoFS.app" --args register 9b5ad352-a727-4100-9557-53afbf87aa2c TestMount --result-file "$HOME/Library/Containers/io.ventoos.VentoFS/Data/tmp/VentoFSResults/register.txt"
open -nW "$HOME/Library/VentoOS/VentoFS.app" --args status 9b5ad352-a727-4100-9557-53afbf87aa2c --result-file "$HOME/Library/Containers/io.ventoos.VentoFS/Data/tmp/VentoFSResults/status.txt"
open -nW "$HOME/Library/VentoOS/VentoFS.app" --args unregister 9b5ad352-a727-4100-9557-53afbf87aa2c --result-file "$HOME/Library/Containers/io.ventoos.VentoFS/Data/tmp/VentoFSResults/unregister.txt"
```

关键结果：

- `REGISTER=ok`
- `STATUS=active`
- `UNREGISTER=ok`
- `TARGET_CHECK=failed`

## 构建与测试结果

| 项目 | 结果 |
|---|---|
| `cargo test -p ventoos-mount` | 通过 |
| `cargo build -p ventoos-server` | 通过 |
| `pnpm build` | 未执行，当前环境缺少 `node` |

## 后续建议

下一轮应继续聚焦：

1. 追查 `FP -2011` 的根因
2. 对照 Apple 的 `NSFileProviderReplicatedExtension` 最小可用要求补齐同步状态实现
3. 在真实 Finder 浏览场景下做一次端到端验证
