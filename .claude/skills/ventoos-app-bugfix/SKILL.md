---
name: ventoos-app-bugfix
description: Use when fixing bugs in VentoOS built-in applications, diagnosing app-specific issues like UI rendering problems, data loading failures, state management bugs, or app-backend communication errors.
---

# VentoOS 应用 Bug 修改

## 概述

以架构师视角评估应用问题，以产品经理视角细化用户描述，最终通过最小改动修复 Bug，全程复用系统能力，不重复造轮子。

## 状态持久化硬约束

- 只要问题涉及应用状态，就必须先确认该状态是否已经进入后端数据库持久化链路，禁止业务状态只停留在页面组件或临时内存里
- 页面只是表现层，组件内 `useState` 只能承载临时 UI 状态；可恢复的业务状态必须放在 store/service，并同步到数据库
- 修复状态类 Bug 时，必须同时检查刷新后的恢复行为；如果刷新会丢失状态，说明修复仍不完整
- 单窗口应用优先检查是否可复用 `window appState -> SQLite`；领域数据或共享数据则必须进入对应 Rust/SQLite 持久化模块

## 第一步：了解与评估应用

在动手之前，先建立对应用的基础认知：

```
1. 应用目录：web/src/apps/<app-id>/
2. 阅读 manifest.ts：了解权限、窗口配置、后端依赖
3. 阅读 App.tsx / index.ts：了解入口结构
4. 确认该应用是否有 Rust 后端（hasBackendPlugin）
5. 粗读组件结构，了解数据流向
```

## 第二步：需求细化（产品经理视角）

用户描述的 bug 往往不够精确，主动澄清：
- **触发条件**：什么操作触发了这个问题
- **预期行为 vs 实际行为**：明确差异
- **是否必现**：每次都出现还是偶发
- **影响范围**：只影响一个功能，还是整个应用

## 第三步：定位 Bug

### 应用内常见 Bug 类型

| 症状 | 常见根因 | 查找位置 |
|------|---------|---------|
| 数据不显示/加载失败 | API 调用错误、连接未初始化 | `api.ts`、应用 hooks |
| 状态不同步 | Zustand store 更新遗漏 | `store.ts`、事件监听 |
| 按钮点击无效 | 事件处理器绑定错误/条件判断 | 组件事件处理 |
| 窗口大小异常 | manifest 尺寸配置 | `manifest.ts` |
| 与系统功能不联动 | 未使用系统服务 API | 检查是否应使用 `@/services` |
| 后端请求失败 | Rust 接口变更/权限缺失 | `native/crates/` 对应模块 |
| 刷新后数据丢失 | 业务状态只在页面内存，未落库 | `store.ts`、`useAppStateSync`、Rust 持久化层 |

### 定位工具
```bash
# 搜索关键词
grep_search "相关函数名" --include "web/src/apps/<app-id>/**"
# 查看后端错误
cd native && cargo build 2>&1 | grep error
```

## 第四步：系统能力复查（不要绕过系统层）

修复前先确认：是否应该使用现有系统能力而不是自己实现？

```ts
// 常见"自己实现但本应复用"的场景
// ❌ 自己维护连接状态 → ✅ useConnectionStore()
// ❌ 自己实现通知弹窗 → ✅ notificationService.push()
// ❌ 自己实现任务轮询 → ✅ taskService + useTaskStore()
// ❌ 自己实现文件读写 → ✅ VFS 服务层
// ❌ 自己的加载状态 → ✅ Spinner + EmptyState 组件
```

## 第五步：修复实施

### 最小修复原则
- 只改 bug 相关代码，不借机重构
- 如果 bug 根因就是架构问题（如绕过了系统层），则需要说明并提出重构计划

### 跨层 Bug
若 bug 涉及前端 + Rust，可使用子 agent：
- 子 agent A：前端应用层修复
- 子 agent B：Rust 后端修复
- 主 agent：接口对齐 + 汇总验收

## 验证流程

```bash
# 前端
cd web && pnpm build   # 无构建错误
cd web && pnpm test    # 相关测试通过

# Rust（如涉及后端）
cd native && cargo clippy
cd native && cargo build
cd native && cargo test
```

## 测试补充要求

- bug 修复后**必须补充**覆盖该路径的测试用例
- 测试应能在未来防止同类 bug 再次出现
- 禁止只修代码不补测试就宣称完成

## 完成后提交

```bash
cd /path/to/VentoOS
git add web/src/apps/<app-id>/
git add native/crates/ventoos-<app-id>/  # 如涉及后端
git commit -m "fix(<app-id>): <问题描述>"
git push
```

若有冲突，理解冲突原因后智能合并，不要盲目强制覆盖。
