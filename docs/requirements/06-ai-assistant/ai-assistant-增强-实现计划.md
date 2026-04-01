# AI Assistant 增强 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性增强 VentoOS AI Assistant 的 provider 接入、探针测试、预设 / 自定义 agent 与前端配置 UI。

**Architecture:** 后端将 AI provider 拆分为原生 provider 与 OpenAI-compatible provider 两大类，并以统一 capability / probe / profile 模型向前端暴露。前端将 AI Assistant 设置页升级为 provider 管理、agent 管理与运行时选择一体化界面，会话层绑定 agent profile。

**Tech Stack:** Rust + Axum + reqwest + serde + React + TypeScript + Vite + Vitest

---

## 文件结构映射

**后端主要修改**

* `native/crates/ventoos-agent/src/types.rs`
* `native/crates/ventoos-agent/src/provider.rs`
* `native/crates/ventoos-agent/src/manager.rs`
* `native/crates/ventoos-agent/src/agent.rs`
* `native/crates/ventoos-agent/src/routes.rs`
* `native/crates/ventoos-agent/src/session.rs`
* `native/crates/ventoos-agent/src/lib.rs`

**前端主要修改**

* `web/src/infra/api/types.ts`
* `web/src/infra/api/client.ts`
* `web/src/apps/ai-assistant/index.tsx`
* `web/src/apps/ai-assistant/*.test.tsx` 或 `*.test.ts`

**文档**

* `docs/requirements/06-ai-assistant/ai-assistant-增强-任务拆解.md`
* `docs/requirements/06-ai-assistant/ai-assistant-增强-完成情况.md`
* `docs/requirements/06-ai-assistant/ai-assistant-增强-验收报告.md`

## Chunk 1: 后端数据模型与测试

### Task 1: Provider / AgentProfile 类型升级

**Files:**
* Modify: `native/crates/ventoos-agent/src/types.rs`
* Test: `native/crates/ventoos-agent/src/types.rs`

- [ ] Step 1: 为 provider/vendor/capability/profile 写失败测试
- [ ] Step 2: 运行相关测试并确认失败
- [ ] Step 3: 实现最小类型扩展
- [ ] Step 4: 运行测试确认通过

### Task 2: Provider Probe 与地址模板

**Files:**
* Modify: `native/crates/ventoos-agent/src/provider.rs`
* Modify: `native/crates/ventoos-agent/src/types.rs`
* Test: `native/crates/ventoos-agent/src/provider.rs`

- [ ] Step 1: 写 provider probe 构造与地址模板失败测试
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 实现最小 probe 请求、模板与 vendor 元数据
- [ ] Step 4: 运行测试确认通过

### Task 3: AgentManager / Route / Session 升级

**Files:**
* Modify: `native/crates/ventoos-agent/src/manager.rs`
* Modify: `native/crates/ventoos-agent/src/routes.rs`
* Modify: `native/crates/ventoos-agent/src/session.rs`
* Modify: `native/crates/ventoos-agent/src/agent.rs`
* Test: `native/crates/ventoos-agent/src/manager.rs`

- [ ] Step 1: 写 agent profile CRUD、probe route、session agent 绑定失败测试
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 实现最小后端逻辑
- [ ] Step 4: 运行测试确认通过

## Chunk 2: 前端 API 与 UI

### Task 4: 前端 API 类型和客户端升级

**Files:**
* Modify: `web/src/infra/api/types.ts`
* Modify: `web/src/infra/api/client.ts`

- [ ] Step 1: 写前端 provider/agent/probe 类型与 helper 的失败测试
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 实现最小类型与 API 客户端扩展
- [ ] Step 4: 运行测试确认通过

### Task 5: AI Assistant UI 升级

**Files:**
* Modify: `web/src/apps/ai-assistant/index.tsx`
* Test: `web/src/apps/ai-assistant/*.test.tsx`

- [ ] Step 1: 写 provider 模板、probe、agent selector/editor 失败测试
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 实现最小 UI 升级
- [ ] Step 4: 运行测试确认通过

## Chunk 3: 验证与文档

### Task 6: 文档回填与验收

**Files:**
* Create: `docs/requirements/06-ai-assistant/ai-assistant-增强-完成情况.md`
* Create: `docs/requirements/06-ai-assistant/ai-assistant-增强-验收报告.md`

- [ ] Step 1: 回填任务完成情况表
- [ ] Step 2: 回填验收核查表
- [ ] Step 3: 运行 `cd web && pnpm build`
- [ ] Step 4: 运行 `cd native && cargo clippy`
- [ ] Step 5: 运行 `cd native && cargo build`
- [ ] Step 6: 运行相关测试并记录结果
