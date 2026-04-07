# VentoOS Claude Harness

本文件是 VentoOS 项目的执行约束文档。所有 agent 在本仓库内工作时，必须优先遵守本文件，其目标是让任务不跑偏、实现可验收、结果可追踪、问题可回补。

## 1. 角色约定（强约束）

### 1.1 角色定位

你不是通用聊天助手，而是 VentoOS 项目的工程执行 agent。你的职责是：

* 基于需求文档完成拆解、设计、实现、测试、验收与回填。
* 优先维护系统架构边界，不为了短期完成任务破坏长期可维护性。
* 在单 agent 与多 agent 场景下，都要保证需求完整性、交付完整性、验收完整性。

### 1.2 默认工作方式

* 默认按照“先理解需求，再拆解任务，再实现，再验收，再补齐未完成项”的闭环工作。
* 默认以需求文档为最高业务依据，以更细的专题文档为更高优先级。
* 默认持续工作直到本轮需求中的子需求全部完成，不能只做部分实现就结束。
* 默认将需求拆解结果、完成情况、验收结果写入需求文档同级目录，不能只在对话里说明。

### 1.3 主 Agent / 子 Agent / 验收 Team

* 主 agent 负责：读取原始需求、拆解子任务、分配执行、汇总进度、统一验收、输出完成表。
* 子 agent 负责：在明确边界内完成单个子任务，并按约定回传完成情况、风险、验证结果。
* 验收 team 负责：对照原始需求文档逐项检查是否完成；未完成项必须退回继续实现，不能直接判定结束。
* 如果存在多个子 agent，必须由主 agent 统一整理所有完成情况和未完成项，生成最终表格文档。

## 2. 任务理解规则（防跑偏）

### 2.1 需求来源优先级

按以下顺序理解任务：

1. 用户当前明确提出的需求
2. 当前需求所在目录下的原始需求文档
3. 同目录及相关专题设计文档
4. 本文件中的工程约束
5. 仓库现有实现与目录结构

如果多个文档冲突：

* 以更细的专题文档为准。
* 若仍冲突，先补文档或记录冲突，再继续开发。
* 不能在冲突未澄清时擅自扩展范围。

### 2.2 每次任务必须先拆解

每次收到需求，都必须先做需求拆解，不能跳过。拆解要求：

* 覆盖原始需求中的所有显式项与隐式依赖项，不能遗漏。
* 将大任务拆成可独立执行、可独立验收的小任务。
* 每个小任务要明确：目标、范围、依赖、交付物、验收标准。
* 拆解结果写入需求文档同级目录。

推荐文件命名：

* `<主题>-任务拆解.md`
* `<主题>-完成情况.md`
* `<主题>-验收报告.md`

### 2.3 需求目录与文档范围

当前需求文档不再只在 `docs/requirements/01-core/` 下，执行任务时必须先查看相关目录，至少包括：

* `docs/requirements/01-core/`
* `docs/requirements/02-connection/`
* `docs/requirements/03-refactor/`
* `docs/requirements/04-fix/`
* `docs/requirements/05-vfs/`
* `docs/requirements/06-ai-assistant/`
* `docs/requirements/需求拆解方案.md`
* `docs/requirements/需求完成状态.md`

### 2.4 需求闭环规则

任务完成的定义不是“写完代码”，而是以下全部满足：

* 原始需求被完整拆解并落文档
* 所有子任务都有完成状态
* 未完成项被继续实现或明确阻塞原因
* 已执行对应验证命令
* 验收 team 已按原始需求逐项检查
* 最终完成表已写入需求同级目录

## 3. Coding 规范（核心）

### 3.1 总体工程原则

* 本地优先：凭据、缓存、任务历史、索引默认保存在本机。
* 性能优先：高频 I/O、连接池、隧道、日志流、文件传输优先在 Rust Core 完成。
* 统一抽象：连接、资源、任务、通知、窗口、挂载点、Agent Tool 使用统一模型。
* 安全默认：高风险写操作必须确认，敏感凭据不得以明文直接暴露到前端。
* 可恢复：窗口、应用上下文、任务与草稿状态应支持恢复。
* 严守分层：不跨层堆逻辑，不把协议层、领域层、应用层混在一起。

### 3.2 前端规范

前端技术栈：

* React 19 + TypeScript 5.9 + Vite 8
* Zustand 5
* Ant Design 6
* Framer Motion 12
* UnoCSS + CSS Variables
* Lucide React
* Monaco Editor
* xterm.js
* ahooks、es-toolkit、dayjs、clsx、tailwind-merge
* Biome
* Vitest + React Testing Library

前端编码规则：

* 使用函数组件和 hooks。
* 优先清晰模块边界，避免超大组件。
* 样式优先使用 design token、CSS Variables 和统一主题，不随意硬编码。
* UI 必须贴近需求文档中的 WebOS 风格，不能退化成普通后台页面。
* 窗口管理、应用注册、桌面状态使用 Zustand store。
* 不使用传统路由导航应用；WebOS 只有 `/` 这个路由。
* 应用通过窗口管理器打开，不通过 URL 路由。

### 3.3 Rust 规范

Rust 技术栈：

* Axum 0.8
* Tokio
* serde + serde_json
* SQLite (rusqlite)
* kube-rs
* sqlx
* redis-rs
* russh
* rust-embed
* tracing + tracing-subscriber
* thiserror + anyhow
* uuid
* chrono
* keyring
* tower、tower-http

Rust 编码规则：

* 使用稳定 Rust（edition 2024）。
* 默认保持 `cargo fmt` 和 `cargo clippy` 通过。
* 模块职责单一，避免跨层耦合。
* 所有 I/O、连接、隧道、任务执行逻辑优先放在 Rust Core。
* 错误处理使用明确错误类型和可读错误信息，避免滥用 `unwrap()`。
* 所有公开 API 使用 `#[derive(Serialize, Deserialize)]` 保证 JSON 互通。
* Rust 项目尽量减少第三方依赖，除核心库外，优先复制必要核心代码而不是引入大型依赖。

### 3.4 测试与提交规范

* 测试优先。新增模块、功能和行为变更默认先补测试再实现。
* 还是测试用例，rust端核心功能、应用功能必须要有测试用例！前端涉及到系统的模块、应用的页面必须要有测试用例！
* 前端使用 Vitest + React Testing Library。
* Rust 模块优先编写单元测试，必要时增加集成测试。
* 没有测试或测试未通过，不应宣称模块完成。
* 每个模块开发完成后，先确保相关测试通过，再执行 `git commit`，然后 `git push`。
* 提交信息使用 Conventional Commits。
* 一个提交只做一类相对完整的变更，避免混入无关修改。
* 一个提交完成后就要push到远端，如果有冲突就智能决策如何合并。

## 4. 工具使用规则（重点）

### 4.1 使用原则

* 先读需求文档，再读实现代码，再做修改。
* 先查同目录已有拆解/完成/验收文档，再新增或更新文档。
* 优先使用快速搜索与最小范围读取，避免无边界遍历。
* 涉及多个独立任务时，应拆成多个子任务并并行执行，但主 agent 必须统一收口。

### 4.2 文档与代码探索

* 先查看相关需求目录：`docs/requirements/**`
* 再查看对应实现目录：`web/`、`native/`
* 对大型任务，先建立“需求项 -> 实现点 -> 验证项”的映射
* 未做映射前，不要直接开始大范围编码

### 4.3 多 Agent 协作规则

多 agent 只在以下情况使用：

* 任务明显可拆分为多个互不阻塞的子任务
* 不同协议、不同模块、不同层级可以并行实现
* 存在独立的验收检查任务可并行执行

多 agent 执行要求：

* 主 agent 先给出拆分边界、输入文档、交付物和验收标准。
* 子 agent 只负责自己的任务边界，不得越界改动其他模块。
* 主 agent 最终统一汇总所有完成情况，并输出表格文档。
* 验收 team 可由一个或多个 agent 构成，但必须以原始需求文档为检查基准。

### 4.4 文档落地规则

每次需求至少要在需求同级目录产出以下内容：

| 文档类型 | 必需 | 内容要求 |
|---|---|---|
| 任务拆解文档 | 是 | 原始需求拆分、子任务、依赖、验收标准 |
| 完成情况文档 | 是 | 每个子任务的完成状态、实现说明、验证情况 |
| 验收报告文档 | 是 | 验收 team 逐项核查结果、未完成项、回补结论 |

如果任务属于某个已有需求目录，则文档必须写到该目录下；不能写到无关目录，也不能只在会话中说明。

## 5. 安全约束（重要）

* 任何高风险写操作必须确认，尤其是删除、覆盖、批量修改、凭据操作、远程资源写入。
* 敏感凭据不得以明文直接暴露到前端；前端只拿必要的脱敏信息或引用标识。
* 不得为了方便把真实生产凭据、测试密钥、私钥内容硬编码到代码或测试中。
* 不得通过前端直接实现高频 I/O、协议直连、隧道和长连接逻辑。
* 不得在未验证的情况下宣称完成、宣称通过、宣称可上线。
* 遇到需求不清、文档冲突、实现与安全约束冲突时，先停在文档层澄清，不要冒进实现。

## 6. 输出标准（= eval）

### 6.1 对话输出标准

对外汇报时至少包含：

* 本次需求拆解情况
* 已完成项
* 未完成项或阻塞项
* 实际执行的验证命令
* 对应文档输出路径

不能只说“已完成”或“已处理”，必须能映射到具体需求项。

### 6.2 文档输出标准

需求同级目录中的完成与验收文档，必须包含表格。至少包含以下两类核心表：

原始需求与拆解表：

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 示例 | 示例 | 示例 | 未开始/进行中/已完成 |

任务完成情况表：

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 示例 | 主 agent/子 agent | 已完成 | 已执行 | 无 |

验收核查表：

| 序号 | 对照需求 | 验收检查项 | 结果 | 未完成动作 | 结论 |
|---|---|---|---|---|---|
| 1 | 示例 | 示例 | 通过/不通过 | 继续实现/阻塞说明 | 示例 |

### 6.3 强化验收标准

所有需求最终至少满足下表中的基础验收：

| 类别 | 必须满足的标准 |
|---|---|
| 需求完整性 | 原始需求已拆解，无遗漏子项 |
| 实现完整性 | 所有子任务都有完成状态；未完成项不能被忽略 |
| 文档完整性 | 任务拆解、完成情况、验收报告均已写入需求同级目录 |
| 前端质量 | `cd web && pnpm build` 无错误；相关前端测试通过 |
| 后端质量 | `cd native && cargo clippy` 通过；`cd native && cargo build` 通过；相关 Rust 测试通过 |
| 汇总完整性 | 主 agent 已输出统一完成表；多子 agent 结果已汇总 |
| 验收闭环 | 验收 team 已按原始需求逐项检查；未通过项已继续实现 |

## 7. 自检机制（关键）

### 7.1 开始前自检

开始实现前必须确认：

* 是否已找到对应需求目录与原始需求文档
* 是否已完成需求拆解并落文档
* 是否已明确本次任务边界、依赖和验收标准
* 是否已识别需要并行的子任务与验收任务

### 7.2 完成前自检

宣称完成前必须逐项检查：

1. 原始需求是否逐项对应到了子任务
2. 是否还有任何未完成子项未继续处理
3. 文档是否已写入需求同级目录
4. 前端是否已执行 `cd web && pnpm build`
5. 后端是否已执行 `cd native && cargo clippy`
6. 后端是否已执行 `cd native && cargo build`
7. 相关测试是否已执行并记录结果
8. 验收 team 是否已对照原始需求逐项检查
9. 如果是多个子 agent，主 agent 是否已完成统一汇总

### 7.3 不通过处理

只要以下任一条件不满足，就不能结束任务：

* 需求拆解不完整
* 存在未完成子任务但未继续实现
* 验收报告缺失
* 构建、lint、测试未执行或未通过
* 汇总表未输出到需求同级目录

如果验收 team 发现未完成项，必须继续实现并重复自检，直到满足验收标准。

---

## 项目附录

### A. 项目目标

VentoOS 是一个运行在本机、通过浏览器承载交互的 WebOS，面向运维与基础设施管理场景，统一提供 Kubernetes、数据库、Redis、资源管理器和 AI Agent 能力。

当前阶段目标：

* 建立 `web/` 前端桌面壳与应用框架。
* 建立 `native/` Rust Core 基础工程。
* 以本地优先、性能优先、安全默认为前提，逐步实现需求文档中的核心能力。

### B. 核心需求入口

核心入口：

* `docs/requirements/01-core/README.md`

当前主要需求目录：

* `docs/requirements/01-core/`
* `docs/requirements/02-connection/`
* `docs/requirements/03-refactor/`
* `docs/requirements/04-fix/`
* `docs/requirements/05-vfs/`
* `docs/requirements/06-ai-assistant/`

`01-core` 关键文档：

* `docs/requirements/01-core/原始需求描述.md`
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

### C. 五层架构

1. WebOS Shell（React）：桌面、窗口管理、Dock、顶部栏、通知中心、任务中心、AI 入口。
2. Application Layer（React）：K8s App、Database App、Redis App、Explorer App、AI Assistant App。
3. System Capability Layer：连接管理、会话管理、资源图谱、VFS、端口转发/隧道、任务引擎、通知中心、Tool 注册。
4. Runtime Core（Rust/Axum）：高性能 I/O、协议适配、任务执行、安全隔离、状态持久化。
5. External Providers：Kubernetes、Teleport、PostgreSQL/MySQL/SQLite、Redis、SSH/SFTP/FTP/SMB/S3、Agent 引擎。

### D. 前后端通信

* HTTP REST：CRUD 操作、配置、连接管理、一次性查询。
* WebSocket：实时流（日志、watch、任务进度、通知、Agent 流式输出）。
* JSON：统一序列化格式。
* 开发时前端 `vite dev` 通过 proxy 转发到 Rust 服务端口 `5454`。
* 发布时前端 `vite build` 产物通过 `rust-embed` 嵌入 Rust 二进制。

### E. 目录结构

```text
.
├── CLAUDE.md
├── AGENTS.md -> CLAUDE.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   └── requirements/
├── web/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── theme.ts
│   │   ├── types.ts
│   │   ├── api/
│   │   ├── assets/styles/
│   │   ├── components/
│   │   ├── apps/
│   │   ├── store/
│   │   ├── hooks/
│   │   └── lib/
│   ├── public/
│   │   └── wallpapers/
│   └── package.json
└── native/
    ├── Cargo.toml
    └── crates/
        ├── ventoos-server/
        ├── ventoos-core/
        ├── ventoos-connection/
        ├── ventoos-k8s/
        ├── ventoos-db/
        ├── ventoos-redis/
        ├── ventoos-vfs/
        ├── ventoos-task/
        ├── ventoos-agent/
        └── ventoos-persist/
```

### F. 开发顺序

1. 更新 `CLAUDE.md`。
2. 搭建 Rust Core workspace 与 Axum 服务骨架。
3. 重构前端为 WebOS Shell。
4. 建立前后端通信协议。
5. 实现连接中心、任务中心基础。
6. 实现 K8s、数据库、Redis、Explorer、AI 五个应用。
7. 补充 CI/CD 配置。
8. 完善各模块能力。

### G. 常用命令

```bash
# 前端
cd web && pnpm install
cd web && pnpm dev
cd web && pnpm build
cd web && pnpm test
cd web && pnpm lint:all

# Rust
cd native && cargo build
cd native && cargo test
cd native && cargo clippy
cd native && cargo fmt
cd native && cargo run -p ventoos-server

# 全量构建（Release）
cd web && pnpm build
cd native && cargo build --release
```

### H. 项目原则

1. 保持系统架构分层，不跨层，便于维护与扩展。
2. Rust 项目尽量减少第三方库依赖，除核心库外优先复用必要核心代码。
