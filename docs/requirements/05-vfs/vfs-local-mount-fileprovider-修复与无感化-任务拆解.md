# VFS Local Mount FileProvider 修复与无感化 - 任务拆解

## 原始需求

在已有分析结论基础上，继续完成：

1. 修复当前 FileProvider 扩展不可用问题
2. 将安装、自检、失败提示改造成对用户尽量无感、可诊断的体验

## 需求拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 修复 FileProvider 扩展不可用 | 修正 `VentoFS` entitlements / 安装链路 | `pluginkit` 能识别 `io.ventoos.VentoFS.FileProvider` | 进行中 |
| 2 | 修复 FileProvider 扩展不可用 | 后端实现真实可用性诊断 | `check-fileprovider` 不再只看 app 是否存在 | 未开始 |
| 3 | 用户尽量无感 | 前端使用新的诊断结果展示安装与失败提示 | 不再误报“扩展已就绪” | 未开始 |
| 4 | 用户尽量无感 | 失败场景输出更可执行的诊断信息 | 用户能知道下一步怎么做 | 未开始 |
| 5 | 测试与验收 | 增加诊断相关测试并执行构建/测试 | 至少相关 Rust 测试通过，后端构建通过 | 未开始 |
| 6 | 文档闭环 | 补完成情况与验收报告 | 文档写入需求同级目录 | 未开始 |

## 设计约束

- 不移除现有 FUSE 路径，只修复和增强 FileProvider 路径
- 优先修后端真实诊断能力，再接前端提示
- 避免把底层 macOS 错误直接原样暴露给用户
- 若 macOS 仍有额外限制，优先提供准确诊断而不是继续猜测式修补

## 验收重点

1. `pluginkit -mvv -p com.apple.fileprovider-nonui` 能看到 `io.ventoos.VentoFS.FileProvider`
2. `/api/dependencies/check-fileprovider` 返回结构化诊断，而不是单一 `available`
3. 前端在“未安装 / 已安装但系统未接受 / 可用”三种状态下给出不同提示
4. `cargo build` 通过
5. 相关 Rust 测试通过
