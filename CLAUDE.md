# VentoOS

## 项目名称

VentoOS

## 项目目标

VentoOS 是一个运行在本机、通过浏览器承载交互的 WebOS，面向运维与基础设施管理场景，统一提供 Kubernetes、数据库、Redis、资源管理器和 AI Agent 能力。

当前阶段目标：

* 建立 `web/` 前端桌面壳与应用框架。
* 建立 `native/` Rust Core 基础工程。
* 以本地优先、性能优先、安全默认为前提，逐步实现需求文档中的核心能力。

## 需求文档

核心需求入口：

* `docs/requirements/01-core/README.md`

关键专题文档：

* `docs/requirements/01-core/ventoos-prd.md`
* `docs/requirements/01-core/ventoos-architecture.md`
* `docs/requirements/01-core/ventoos-system-design.md`
* `docs/requirements/01-core/ventoos-ui.md`
* `docs/requirements/01-core/ventoos-ai.md`
* `docs/requirements/01-core/ventoos-k8s.md`
* `docs/requirements/01-core/ventoos-database.md`
* `docs/requirements/01-core/ventoos-redis.md`
* `docs/requirements/01-core/ventoos-vfs.md`
* `docs/requirements/01-core/ventoos-service-connectivity.md`

## 开发原则

* 本地优先：凭据、缓存、任务历史、索引默认保存在本机。
* 性能优先：高频 I/O、连接池、隧道、日志流、文件传输必须优先在 Rust Core 侧完成。
* 统一抽象：连接、资源、任务、通知、窗口、挂载点、Agent Tool 使用统一模型。
* 安全默认：高风险写操作必须确认，敏感凭据不得以明文直接暴露到前端。
* 可恢复：窗口、应用上下文、任务与草稿状态应支持恢复。

## 编码规范

### 前端

* 技术栈：React + TypeScript + Vite。
* 使用函数组件和 hooks。
* 优先使用清晰的模块边界，避免超大组件。
* 样式优先使用设计 token、变量和统一主题，不随意硬编码。
* UI 实现必须贴近需求文档中的 WebOS 风格，不退化为普通后台页面。

### Rust

* 使用稳定 Rust。
* 默认开启严格 lint，保持 `cargo fmt` 和 `cargo clippy` 通过。
* 模块职责单一，避免把协议层、领域层、应用层混杂在一个文件。
* 所有 I/O、连接、隧道、任务执行逻辑优先放在 Rust Core。
* 错误处理使用明确的错误类型和可读错误信息，避免 `unwrap()` 滥用。

## 测试规范

* 测试优先。新增模块、功能和行为变更默认先补测试再实现。
* 前端至少保证基础单元测试或状态逻辑测试可补齐。
* Rust 模块必须优先编写单元测试，必要时增加集成测试。
* 没有测试或测试未通过，不应宣称模块完成。
* 每个模块开发完成后，必须先确保相关测试通过，再执行 `git commit`，然后 `git push`。

## Git 规范

* 提交信息使用 Conventional Commits，例如 `feat: ...`、`fix: ...`、`docs: ...`、`chore: ...`。
* 一个提交只做一类相对完整的变更，避免把无关修改混在一起。
* 在提交前执行该模块对应的最小验证命令。
* 每个模块开发测试通过后要提交 Git 并推送远端。

## 目录结构

```text
.
├── CLAUDE.md
├── AGENTS.md -> CLAUDE.md
├── docs/
│   └── requirements/
├── web/
│   ├── src/
│   ├── public/
│   └── package.json
└── native/
    ├── Cargo.toml
    ├── crates/
    └── src/
```

目录约定：

* `docs/`：需求、架构、设计与开发文档。
* `web/`：WebOS 前端桌面壳、应用 UI、状态管理、样式系统。
* `native/`：Rust Core、系统能力、协议适配、任务系统、Agent Bridge。

## 开发顺序建议

1. 搭建前端桌面壳与窗口系统骨架。
2. 搭建 Rust Core 基础工程与系统 API 骨架。
3. 建立前后端通信协议。
4. 优先完成连接中心、任务中心、K8s 基础能力。
5. 逐步接入数据库、Redis、VFS 与 AI。

## 沟通规则

* 任何实现都应优先对齐本目录下需求文档。
* 如果需求文档之间冲突，以更细的专题文档为准；若仍冲突，先补文档再开发。
* 若某项实现超出当前里程碑，应先提出拆分方案，不直接扩散范围。
