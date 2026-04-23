---
name: ventoos-system-feature-iteration
description: Use when adding new system-level features to VentoOS, iterating on shell components, kernel capabilities, or cross-app infrastructure, especially when the change affects multiple layers of the architecture.
---

# VentoOS 系统功能迭代

## 概述

以 OS 级架构师视角完成系统功能设计与迭代。核心原则：**遵循现有分层，不跨层堆逻辑，不重复设计。**

## 状态持久化硬约束

- 新增系统能力时，业务状态必须同步进入数据库持久化层，页面和组件只负责表现与交互，不得成为唯一状态源
- 需求设计阶段就要标出哪些状态需要刷新恢复，并明确采用哪条持久化链路：`window appState -> SQLite`、系统 settings、或专用领域表
- 只放在前端 store / 组件内存中的状态，一律视为临时 UI 态；会影响工作上下文、任务续接、会话恢复的数据必须落库
- 验收时除功能可用外，还必须检查刷新恢复、重启恢复或重新打开窗口后的状态一致性

## 五层架构速查

| 层级 | 目录 | 职责 |
|------|------|------|
| WebOS Shell | `web/src/shell/` | 桌面、窗口、Dock、TopBar、通知、AI 入口 |
| Application Layer | `web/src/apps/` | 各独立应用（K8s、DB、Redis、Explorer 等） |
| System Capability | `web/src/services/` + `web/src/kernel/` | 连接、任务、通知、VFS、键盘、设置 |
| Runtime Core | `native/crates/` | 高性能 I/O、协议适配、持久化 |
| External Providers | 外部系统 | K8s、DB、Redis、SSH、S3 等 |

## 迭代前必做：需求理解

```
1. 读取相关需求文档 docs/requirements/ 下对应目录
2. 确认功能属于哪一层（Shell/App/System/Core）
3. 检查现有实现中是否已有类似能力（避免重复）
4. 分析跨层影响（一个功能会牵涉哪几层）
5. 写出"功能定位 → 影响层级 → 接口设计"的三行摘要
```

## 分层实施规则

### 影响 Shell 层
- 修改对象：`web/src/shell/` 下的组件
- 状态层：Zustand store，不引入额外路由
- 动效：使用 Framer Motion，参考 `tokens.animation`
- **禁止**：在 Shell 中发起直接的外部网络请求
- **新增要求**：Shell 态若需要刷新恢复，必须同步到后端数据库，不能只留在前端 store

### 影响 System Capability 层
- 服务文件：`web/src/services/<module>/`
- 模式：Zustand store（状态缓存） + service 对象（API 调用/WS 订阅） + 后端数据库持久化
- **禁止**：在 service 中包含 React 组件或渲染逻辑

### 影响 Runtime Core（Rust）
- 模块路径：`native/crates/ventoos-<module>/`
- 必须执行：`cargo fmt` + `cargo clippy` 通过
- 错误处理：使用 `thiserror` 定义明确错误类型，禁止滥用 `unwrap()`
- 公开 API：加 `#[derive(Serialize, Deserialize)]`

### 前后端通信
- REST：CRUD、配置、一次性查询（`/api/v1/...`）
- WebSocket：实时流-日志、任务进度、通知（`/ws/...`）

## 架构完整性检查

实施完成后对照检查：

- [ ] 前端逻辑是否有下沉到 Rust 的必要（高频 I/O、协议、隧道）
- [ ] 是否引入了跨层耦合（如 Shell 直接调用 Rust API）
- [ ] 是否重复实现了已有能力（查 `web/src/services/index.ts`）
- [ ] 状态变更是否通知了相关联的层（如任务完成 → 通知中心）
- [ ] 有无安全边界缺失（写操作是否需要确认、凭据是否暴露）

## 测试要求

- Rust 核心逻辑：单元测试 + 必要集成测试
- 前端 Shell/Service：Vitest + React Testing Library
- 执行验证：

```bash
# Rust
cd native && cargo clippy && cargo build && cargo test

# 前端
cd web && pnpm build && pnpm test
```

## 使用子 Agent 策略

当任务明显可拆分时使用子 agent：
- Rust Core 实现（子 agent A）+ 前端 Service/UI 实现（子 agent B）同步进行
- 主 agent 统一定义接口规范，子 agent 各自实现，最终主 agent 汇总验收

## 完成后提交

```bash
cd /path/to/VentoOS
git add -A
git commit -m "feat(system): <功能描述>"
git push
```

若有冲突，理解冲突原因后智能合并，不要盲目强制覆盖。
