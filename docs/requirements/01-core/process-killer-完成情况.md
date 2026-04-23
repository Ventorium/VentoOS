# Process Killer（进程查杀）完成情况

## 任务完成状态

| 序号 | 子任务 | 完成情况 | 验证结果 | 备注 |
|------|--------|----------|----------|------|
| 1 | 应用图标设计 | 已完成 | 已验证 | 使用 Crosshair 图标，indigo-purple 渐变 |
| 2 | 后端 API 实现 | 已完成 | 已验证 | 3 个接口：列表、端口查询、查杀 |
| 3 | 前端应用框架 | 已完成 | 已验证 | manifest + api + index.tsx |
| 4 | 进程列表与排序 | 已完成 | 已验证 | 支持按 PID/CPU/内存/RSS 排序 |
| 5 | 端口查进程功能 | 已完成 | 已验证 | 输入端口后显示占用进程 |
| 6 | 右键查杀操作 | 已完成 | 已验证 | 右键菜单 + 确认对话框 |
| 7 | 构建与测试 | 已完成 | 已验证 | pnpm build 通过，cargo clippy/build/test 通过 |
| 8 | 提交与推送 | 已完成 | 已验证 | 已推送至 origin/main |

## 验证命令

```bash
# 前端构建
cd web && pnpm build
# ✓ built in 2.60s

# 后端检查
cd native && cargo check -p ventoos-server
# Finished dev profile

cd native && cargo clippy -p ventoos-server
# Finished dev profile (63 warnings, pre-existing)

cd native && cargo build -p ventoos-server
# Finished dev profile

cd native && cargo test -p ventoos-server process_killer
# 3 passed; 0 failed
```

## 新增文件

- `native/crates/ventoos-server/src/process_killer.rs` — 后端 API
- `web/src/apps/process-killer/manifest.ts` — 应用声明
- `web/src/apps/process-killer/api.ts` — 前端 API 调用
- `web/src/apps/process-killer/index.tsx` — 主组件
- `docs/requirements/01-core/process-killer-任务拆解.md` — 任务拆解
- `docs/requirements/01-core/process-killer-完成情况.md` — 本文档

## 修改文件

- `native/crates/ventoos-server/src/lib.rs` — 注册 process_killer 模块
- `native/crates/ventoos-server/src/routes.rs` — 注册 /api/process-killer/* 路由
- `web/src/apps/index.ts` — 注册 processKillerManifest

## 功能说明

1. **进程列表**：自动每 5 秒刷新，显示 PID、名称、CPU%、内存%、RSS、启动参数
2. **排序**：点击表头可按 PID / CPU% / 内存% / RSS 升序或降序排列
3. **搜索**：支持按名称、参数、PID 过滤
4. **端口查询**：输入端口号，调用 `lsof -i :port` 查询占用进程，可一键查杀
5. **右键查杀**：右键进程行 → "查杀进程" → 确认对话框 → 执行 `kill -9 pid`
6. **颜色标记**：CPU ≥ 50% 或内存 ≥ 20% 显示红色，≥ 10% / ≥ 5% 显示橙色
