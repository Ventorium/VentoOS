# API Client 应用 - 完成情况

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|------|----------|--------|----------|------|
| 1 | PRD 文档 | 编写完整 PRD | 涵盖布局、交互、接口、数据模型 | 已完成 |
| 2 | 任务拆解 | 3 阶段拆解 | P0/P1/P2 优先级划分 | 已完成 |
| 3 | 应用图标 & Manifest | 注册应用清单 | 图标、颜色、默认尺寸 | 已完成 |
| 4 | Rust 后端 crate | 实现 ventoos-api-client | store/proxy/import/codegen/routes | 已完成 |
| 5 | 后端插件注册 | 注册到 ventoos-server | AppPlugin trait 实现 | 已完成 |
| 6 | 前端应用 | 实现完整 UI | 16 个组件文件 | 已完成 |
| 7 | 前端注册 | 注册到 apps/index.ts | 懒加载 + manifest | 已完成 |
| 8 | 测试用例 | 前后端测试 | Rust 13 pass, 前端 11 pass | 已完成 |
| 9 | 构建验证 | pnpm build + cargo clippy | 无错误 | 已完成 |
| 10 | 协议 Activity Bar | 通用 UIKit + API Client 接入 | HTTP / WebSocket / MQTT / Guide 视图切换 | 已完成 |
| 11 | 环境链路补齐 | 变量解析 + Bearer 注入 + 响应值写入环境变量 | 登录 token 可保存为 `TOKEN` 并被后续请求复用 | 已完成 |
| 12 | WebSocket / MQTT 面板 | 浏览器侧协议测试工作台 | 支持连接、发送、日志查看 | 已完成 |
| 13 | DTO 映射修复 | 后端 snake_case/扁平树 -> 前端模型 | collection/env UI 不再直接依赖后端 DTO 形态 | 已完成 |
| 14 | 工作区状态持久化 | tabs / activeView / environment / response / WS-MQTT 会话写入数据库 | 刷新后状态与数据可恢复，页面不再是唯一状态源 | 已完成 |

## 任务完成情况表

| 序号 | 子任务 | 负责人 | 完成情况 | 验证结果 | 备注 |
|------|--------|--------|----------|----------|------|
| 1 | PRD 文档 | 主 agent | 已完成 | 文档已落 `docs/requirements/12-api-client/api-client-prd.md` | 17 节完整 PRD |
| 2 | 任务拆解 | 主 agent | 已完成 | 文档已落 `api-client-任务拆解.md` | 3 阶段拆解 |
| 3 | Rust models.rs | 主 agent | 已完成 | cargo clippy 通过 | 完整数据模型 |
| 4 | Rust store.rs | 主 agent | 已完成 | 4 个单元测试通过 | SQLite CRUD + 迁移 |
| 5 | Rust proxy.rs | 主 agent | 已完成 | cargo clippy 通过 | reqwest HTTP 代理 |
| 6 | Rust codegen.rs | 主 agent | 已完成 | 3 个单元测试通过 | curl/js/python 代码生成 |
| 7 | Rust import/ | 主 agent | 已完成 | 6 个单元测试通过 | OpenAPI/Postman/cURL 导入 |
| 8 | Rust routes.rs | 主 agent | 已完成 | cargo clippy 通过 | AppPlugin + 全部路由 |
| 9 | 后端注册 | 主 agent | 已完成 | cargo build 通过 | state.rs 注册插件 |
| 10 | 前端 types/api/store | 主 agent | 已完成 | pnpm build 通过 | TypeScript 类型、API 客户端、Zustand store |
| 11 | 前端 UI 组件 | 主 agent | 已完成 | pnpm build 通过 | TabBar/Sidebar/CollectionTree/UrlBar/RequestTabs/ResponseViewer/KeyValueEditor/BodyEditor/EnvironmentSelector/ImportDialog/RequestEditor |
| 12 | 前端测试 | 主 agent | 已完成 | vitest 11 通过 | store.test.ts |
| 13 | 应用注册 | 主 agent | 已完成 | pnpm build 通过 | manifest + index.ts |
| 14 | 通用 Activity Bar UIKit | 主 agent | 已完成 | pnpm build 通过 | API Client 接入一级协议导航，支持右键配置可见视图 |
| 15 | 环境变量运行时链路 | 主 agent | 已完成 | vitest 运行时/映射/store 22 通过 | 发送前模板解析、Bearer 注入、DTO 映射修复，并覆盖 appState hydrate/snapshot |
| 16 | 响应值保存到环境变量 | 主 agent | 已完成 | vitest store 通过 | 响应 Body/Headers 右键保存到环境变量，支持创建新环境 |
| 17 | WebSocket 测试面板 | 主 agent | 已完成 | pnpm build 通过 | 原生 WebSocket 连接、发消息、日志查看 |
| 18 | MQTT 测试面板 | 主 agent | 已完成 | pnpm build 通过 | MQTT over WebSocket 连接、订阅、发布、日志查看 |
| 19 | PRD/验收文档补充 | 主 agent | 已完成 | 文档已更新 | 补充 Activity Bar、MQTT、token->env 工作流 |
| 20 | API Client appState 建模 | 主 agent | 已完成 | store.test.ts 持久化用例通过 | tabs、响应快照、activeView、hiddenProtocols、WS/MQTT 状态统一进入 store snapshot |
| 21 | 刷新恢复与连接意图恢复 | 主 agent | 已完成 | pnpm build + vitest 通过 | 基于 window appState 写入 SQLite，刷新后恢复 HTTP/WS/MQTT 工作区状态与连接意图 |
| 22 | coding skill 约束补充 | 主 agent | 已完成 | 技能文档已更新 | 强调所有业务状态必须入库，页面只负责表现 |

## 验证命令执行记录

| 命令 | 结果 |
|------|------|
| `cd native && CARGO_TARGET_DIR=target cargo clippy -p ventoos-api-client` | 通过，无警告 |
| `cd native && CARGO_TARGET_DIR=target cargo test -p ventoos-api-client` | 13/13 通过 |
| `cd native && cargo clippy -p ventoos-api-client && cargo build -p ventoos-server` | 通过，server 集成构建成功 |
| `cd web && pnpm build` | 构建成功 |
| `cd web && npx vitest run src/apps/api-client/__tests__/store.test.ts` | 11/11 通过 |
| `cd web && pnpm exec vitest run src/apps/api-client/__tests__/store.test.ts src/apps/api-client/utils/__tests__/runtime.test.ts src/apps/api-client/utils/__tests__/mappers.test.ts --reporter=verbose` | 22/22 通过 |
| `cd web && pnpm build` | Activity Bar / WS / MQTT / env UI 构建通过 |
| `cd web && pnpm exec vitest run src/apps/api-client/__tests__/store.test.ts --reporter=verbose` | 16/16 通过，覆盖 appState hydrate/snapshot |

## 文件清单

### Rust 后端（native/crates/ventoos-api-client/）
- `Cargo.toml`
- `src/lib.rs`
- `src/models.rs`
- `src/store.rs`
- `src/routes.rs`
- `src/proxy.rs`
- `src/codegen.rs`
- `src/import/mod.rs`
- `src/import/openapi.rs`
- `src/import/postman.rs`
- `src/import/curl.rs`

### 前端（web/src/apps/api-client/）
- `manifest.ts`
- `types.ts`
- `api.ts`
- `store.ts`
- `constants.ts`
- `index.tsx`
- `components/TabBar.tsx`
- `components/Sidebar.tsx`
- `components/CollectionTree.tsx`
- `components/UrlBar.tsx`
- `components/RequestTabs.tsx`
- `components/ResponseViewer.tsx`
- `components/KeyValueEditor.tsx`
- `components/BodyEditor.tsx`
- `components/EnvironmentSelector.tsx`
- `components/ImportDialog.tsx`
- `components/RequestEditor.tsx`
- `__tests__/store.test.ts`
- `components/EnvironmentPanel.tsx`
- `components/SaveResponseValueModal.tsx`
- `components/WebSocketWorkbench.tsx`
- `components/MqttWorkbench.tsx`
- `components/ApiClientGuide.tsx`
- `utils/mappers.ts`
- `utils/__tests__/runtime.test.ts`
- `utils/__tests__/mappers.test.ts`

### 修改的已有文件
- `native/Cargo.toml` — 添加 workspace member
- `native/crates/ventoos-server/Cargo.toml` — 添加依赖
- `native/crates/ventoos-server/src/state.rs` — 注册插件
- `web/src/apps/index.ts` — 注册应用
- `web/src/components/AppSidebar/index.tsx` — 扩展底部活动项支持
- `web/src/apps/api-client/api.ts` — 接入 DTO 映射与环境 payload 序列化
- `web/src/apps/api-client/store.ts` — 增加运行时变量解析、环境创建与保存动作，并统一管理可持久化 appState
- `web/src/apps/api-client/types.ts` — 增加 EnvironmentVariable 与可持久化协议状态类型
- `web/src/apps/api-client/index.tsx` — 接入 window appState 持久化与恢复
- `web/src/apps/api-client/components/WebSocketWorkbench.tsx` — 改为从 store 驱动连接配置、草稿与日志
- `web/src/apps/api-client/components/MqttWorkbench.tsx` — 改为从 store 驱动连接配置、订阅意图与日志
- `web/package.json` — 新增 mqtt 依赖
