# VentoOS — 本地开发启动说明

快速启动说明（macOS / Linux）

前端（web）

- 安装依赖（如果当前目录不是 git 仓库，`postinstall` 脚本可能失败，建议使用 `--ignore-scripts`）：

  pnpm --dir web install --ignore-scripts

- 启动开发服务器：

  pnpm --dir web dev

- 构建生产产物：

  pnpm --dir web build

后端（native / Rust）

- 直接运行（开发模式）：

  cd native && cargo run -p ventoos-server

- 构建 release：

  cd native && cargo build --release

常见注意事项

- `web/package.json` 中包含一个 `postinstall` 脚本 `igit install`（依赖于 git 环境），在非 git 工作目录或 CI 环境中会导致 `pnpm install` 失败。使用 `--ignore-scripts` 可跳过该脚本。
- 前端 dev 服务器默认端口为 `5173`；若端口被占用，Vite 会尝试使用其他可用端口（如 `5174`）。请在浏览器中查看 Vite 启动日志以获取实际端口。

简单示例（同时启动后端与前端开发服务器）

```bash
# 在一个终端启动后端
cd native && cargo run -p ventoos-server

# 在另一个终端启动前端
pnpm --dir web install --ignore-scripts
pnpm --dir web dev
```

如果需要，我可以把下面的 `Makefile` 添加到仓库以便一键操作。
