---
name: ventoos-system-bugfix
description: Use when fixing bugs in VentoOS system-level components including shell, kernel, services layer, or Rust core, especially when the bug may span multiple architectural layers or affect system stability.
---

# VentoOS 系统功能 Bug 修改

## 概述

以 OS 级架构师视角诊断并修复系统级 Bug。核心原则：**先定位层级，再找根因，不打补丁，不跨层修复表象**。

## Bug 定位框架

```
问题表现 → 复现步骤 → 影响层定位 → 根因分析 → 最小修复方案
```

### 影响层定位
| 症状关键词 | 怀疑层级 |
|-----------|---------|
| 窗口卡顿/焦点异常/Dock 状态错误 | Shell 层 `web/src/shell/` |
| 连接失败/任务状态错误/通知不触发 | Service 层 `web/src/services/` |
| 内核崩溃/构建报告类型错误 | Kernel 层 `web/src/kernel/` |
| 协议错误/超时/内存占用异常 | Rust Core `native/crates/` |
| API 响应异常/WebSocket 断连 | 前后端通信边界 |

## 诊断步骤

### 1. 现象记录
收集以下信息再动手：
- 复现步骤（最小复现路径）
- 错误信息/堆栈（如有）
- 是否每次必现，还是偶发
- 影响范围（单个应用 / 全系统）

### 2. 架构边界检查
确认 bug 不是架构违规导致的：
- 是否有组件跨层直接调用（如 Shell 直接调 Rust API）
- 是否有状态在多处维护导致不一致
- 是否有事件/消息丢失（WebSocket 断连后未重订阅）

### 3. 代码定位
```bash
# 搜索相关模块
grep_search "关键词" --include "web/src/**"
# 查看 Rust 错误类型
grep_search "error\[" native/
```

### 4. 根因分析（不要跳过）
找到代码位置后，必须理解：
- **为什么会出现这个 bug**（根因，非表象）
- **修复方案是否会引入新问题**
- **是否有类似的潜在 bug 需要一起修复**

## 修复策略

### 最小修复原则
- 只修改必须修改的代码
- 不借机重构（除非重构是修复的必要条件）
- 改动范围扩展需说明原因

### 影响评估
修复前评估：
- [ ] 修复方案是否改变了对外接口（API/类型/事件）
- [ ] 是否需要迁移已有数据
- [ ] 是否影响其他应用

## 验证流程

```bash
# 前端验证
cd web && pnpm build   # 确保无构建错误
cd web && pnpm test    # 运行相关测试

# Rust 验证
cd native && cargo clippy   # 无 lint 警告
cd native && cargo build    # 确保编译通过
cd native && cargo test     # 相关单元测试通过
```

## 测试覆盖要求
- 如果 bug 无对应测试用例 → **先补测试，再修复**
- 测试应覆盖：复现路径 + 边界条件
- 禁止"修完跑一下感觉没问题"就宣称完成

## 使用子 Agent 策略

跨层 bug（同时涉及前端 + Rust）可拆分：
- 子 agent A：前端层定位与修复
- 子 agent B：Rust 层定位与修复
- 主 agent：协调接口一致性，汇总验收

## 完成后提交

```bash
cd /path/to/VentoOS
git add -A
git commit -m "fix(system): <问题描述>"
git push
```

若有冲突，理解冲突原因后智能合并，不要盲目强制覆盖。
