.PHONY: install-frontend dev-frontend build-frontend run-backend build-backend start stop

install-frontend:
	pnpm --dir web install --ignore-scripts

dev-frontend:
	pnpm --dir web dev

build-frontend:
	pnpm --dir web build

run-backend:
	cd native && cargo run -p ventoos-server

build-backend:
	cd native && cargo build --release

start:
	# 在后台启动后端与前端（开发模式）。请在需要时手动停止。
	(cd native && cargo run -p ventoos-server) & \
	pnpm --dir web dev & \
	sleep 1; echo "Started backend and frontend (check terminals)"

stop:
	# 尝试停止已由上述命令启动的进程（可能会匹配到其他进程）。
	-pkill -f "cargo run -p ventoos-server" || true
	-pkill -f "vite" || true
