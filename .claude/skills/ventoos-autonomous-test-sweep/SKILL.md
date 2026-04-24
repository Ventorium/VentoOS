---
name: ventoos-autonomous-test-sweep
description: Use when performing proactive, repository-wide quality sweeps in VentoOS to discover, prioritize, fix, and regression-test system/app bugs without waiting for user-reported issues.
---

# VentoOS 自治测试巡检

## 目标

把“跑构建/跑测试”升级成“持续发现问题 -> 快速定位根因 -> 最小修复 -> 补回归测试 -> 验收回填”的闭环。

## 适用场景

- 用户要求你主动做系统和应用测试
- 需要进行一轮 bug bash / sweep / 回归巡检
- 最近改动较多，想主动发现跨层问题
- 需要组织多个子 agent 并行排查不同模块

## 强约束

- 先跑最便宜的基线门禁：前端 build/test，Rust build/clippy/test
- 先做“发现与分级”，再做修复；不要一上来大改
- 问题必须落到需求目录文档，不能只留在对话里
- 每修一个问题，必须补一条能覆盖该路径的测试或明确记录缺口
- 涉及状态类问题，必须核查持久化链路和刷新恢复

## 巡检输出物

至少维护三份文档：

- 任务拆解：本轮巡检范围、子任务、验收标准
- 完成情况：发现的问题、处理状态、验证结果
- 验收报告：按范围核查通过/未通过项与后续动作

## 推荐巡检顺序

### 1. 基线门禁

```bash
cd web && pnpm build
cd web && pnpm test
cd native && cargo build
cd native && cargo clippy
cd native && cargo test
```

### 2. 高风险优先面

先扫这些面：

- Shell 与 Kernel：窗口、Dock、ContextMenu、TopBar、恢复态
- 应用高频入口：Kubernetes、Settings、Explorer、Database、Redis
- Runtime Core：routes、persist、deps、teleport、VFS、settings 持久化

### 3. 问题分级

每个问题至少标记：

- 严重性：阻断 / 高 / 中 / 低
- 层级：Shell / App / Service / Core / 边界契约
- 类型：功能失效 / 持久化缺失 / 契约不一致 / UI 退化 / 测试缺失

## 子 Agent 编排

主 agent 负责统一问题队列与验收，子 agent 按层拆分：

- 子 agent A：Shell/Kernel 巡检
- 子 agent B：系统服务与持久化巡检
- 子 agent C：Rust Core 与 API 契约巡检
- 子 agent D：重点应用巡检（默认优先 Kubernetes / Settings / Explorer）

每个子 agent 必须返回：

- 复现步骤
- 预期 vs 实际
- 根因位置
- 最小修复建议
- 推荐验证动作

## 修复策略

- 优先修复阻断级和跨层契约问题
- 第一处实质编辑后，立即做一次最窄验证
- 若验证失败，只允许在同一切片内继续修，不要同时扩更多面
- 对相似问题，先确认是否属于同一根因，再批量收口

## 回归测试要求

- 前端问题：补 Vitest / RTL 测试，优先 store、hooks、关键交互
- Rust 问题：补单元测试，必要时补路由测试或集成测试
- 无法立即补测试时，要在完成情况和验收报告里明确记录缺口与原因

## 完成标准

一轮自治巡检完成，至少满足：

- 基线命令已执行并记录
- 至少形成一份问题清单（含严重性和处理状态）
- 至少修复一批高优先级问题或明确阻塞
- 已执行对应验证命令
- 文档已回填到需求目录
