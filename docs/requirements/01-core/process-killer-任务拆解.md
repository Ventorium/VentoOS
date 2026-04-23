# Process Killer（进程查杀）任务拆解

## 原始需求

创建一个查杀进程的应用，支持：
1. 根据高内存 / 高 CPU 占用查杀进程
2. 根据占用端口查杀进程（类似 `lsof -i:8080`）
3. UI 审美在线

## 子任务拆分

| 序号 | 子任务 | 依赖 | 交付物 | 验收标准 |
|------|--------|------|--------|----------|
| 1 | 应用图标设计 | 无 | `manifest.ts` 中的 Icon 组件 | 使用独特渐变配色，与现有应用区分 |
| 2 | 后端 API 实现 | 无 | `process_killer.rs` + 路由注册 | 提供进程列表、端口查进程、杀进程三个接口 |
| 3 | 前端应用框架 | 1 | `manifest.ts`, `api.ts`, `index.tsx` | 应用能在 Launchpad 中打开 |
| 4 | 进程列表与排序 | 2,3 | `index.tsx` 中的进程列表组件 | 显示 PID/名称/CPU%/内存，支持按 CPU/内存排序 |
| 5 | 端口查进程功能 | 2,3 | 端口输入 + 查询结果 | 输入端口后显示占用该端口的进程 |
| 6 | 右键查杀操作 | 4,5 | 右键菜单组件 | 右键进程项显示"查杀"菜单，支持确认对话框 |
| 7 | 构建与测试 | 6 | - | `pnpm build` 通过，`cargo clippy && cargo build` 通过 |
| 8 | 提交与推送 | 7 | git commit + push | 代码已推送到 origin/main |

## 应用信息

- **id**: `process-killer`
- **name**: 进程查杀
- **version**: 1.0.0
- **description**: 根据 CPU/内存占用或端口占用查杀系统进程
- **分类**: 工具类
- **权限**: `shell`, `notifications`
- **后端插件**: 否（直接复用 server 路由）
- **multiWindow**: false
- **defaultSize**: `{ width: 900, height: 650 }`

## 技术方案

### 后端
- 新增 `native/crates/ventoos-server/src/process_killer.rs`
- 在 `routes.rs` 中注册 `/api/process-killer/*` 路由
- macOS: `ps -ax -o pid,pcpu,pmem,rss,vsz,comm,args` + `lsof -i :port -P -n` + `kill -9 pid`
- Linux: `ps -eo pid,pcpu,pmem,rss,vsz,comm,args` + `ss -tlnp` / `lsof -i :port` + `kill -9 pid`

### 前端
- `web/src/apps/process-killer/manifest.ts` — 应用声明
- `web/src/apps/process-killer/api.ts` — API 调用
- `web/src/apps/process-killer/index.tsx` — 主组件
  - 左侧：进程列表（支持排序、搜索）
  - 右侧/上方：端口查询输入
  - 右键菜单：查杀进程
  - 确认对话框
