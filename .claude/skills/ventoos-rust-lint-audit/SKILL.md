---
name: ventoos-rust-lint-audit
description: Use when checking and fixing Rust compilation warnings, clippy lints, or dead code in the VentoOS native workspace. Trigger when cargo build/clippy emits warnings, unused imports/variables, or deprecated patterns appear.
---

# VentoOS Rust Lint Audit

## 概述

系统性地扫描 native workspace 的编译 warning 与 clippy lint，区分"废弃代码"与"未实现功能"，按优先级批量修复，保持代码库清洁。

## 检查入口

```bash
cd native
# 1. 编译级 warning
cargo build 2>&1 | grep -E "warning:.*generated"

# 2. clippy lint（更严格，优先）
cargo clippy 2>&1 | grep -E "warning:.*generated"

# 3. 运行时 warn 日志（tracing）
RUST_LOG=warn cargo run -p ventoos-server 2>&1 | grep -i "WARN"
```

## 分类决策树

对每个 warning，按以下逻辑判断：

```
warning 类型
├── unused_import / unused_variable / dead_code
│   └── → 废弃代码，移除或加前缀 `_`
├── field never read / unused async / unused self
│   ├── 该字段/方法是预留接口？
│   │   ├── 是 → 加 #[allow(...)] 并注释说明预留原因
│   │   └── 否 → 移除或标记为 `_`
├── identical match arms / identical if blocks
│   └── → 代码质量问题，合并分支或提取公共逻辑
├── casting 相关（cast_possible_truncation/wrap/sign_loss）
│   ├── 值域已保证安全？
│   │   ├── 是 → 用 try_into().unwrap_or(...) 或加 #[allow]
│   │   └── 否 → 补充边界检查，这是潜在 bug
├── function too_many_lines / too_many_arguments
│   ├── 属于核心 API 不便改动？
│   │   ├── 是 → 加 #[allow] 并记录技术债
│   │   └── 否 → 提取子函数/参数 struct
├── documentation missing backticks / redundant closure / format! issues
│   └── → 代码质量问题，直接修复
└── 其他（complex type, large err variant, let...else 等）
    └── → 根据影响面判断：安全就修复，涉及 API 变更则加 allow
```

## 批量修复策略

### 第一步：自动修复
```bash
cd native
cargo clippy --fix --workspace --allow-dirty --allow-staged
```

### 第二步：按 crate 逐个清理剩余
对自动修复后仍存在的 warning，按 crate 分组处理：

| 优先级 | 类型 | 处理方式 |
|---|---|---|
| P0 | unused/dead_code | 直接移除 |
| P0 | 类型转换安全隐患 | 加边界检查或显式转换 |
| P1 | 代码风格（doc/format/closure） | 直接修复 |
| P1 | async/self 未使用 | 判断是否为预留接口 |
| P2 | function too many lines/args | 允许保留，加 allow |
| P2 | complex type / large err | 允许保留，加 allow |

### 第三步：验证
```bash
cd native
cargo clippy --workspace        # 应无 warning
cargo build --workspace         # 应无 warning
cargo test --workspace          # 应全部通过
```

## 多 Agent 并行策略

当 warning 数量超过 30 个或涉及 3 个以上 crate 时，拆分给子 agent：

- **子 agent A**：ventoos-persist + ventoos-api-client（数据持久化层）
- **子 agent B**：ventoos-vfs + ventoos-mount（文件系统层）
- **子 agent C**：ventoos-k8s + ventoos-ssh + ventoos-db + ventoos-redis（连接层）
- **子 agent D**：ventoos-server + ventoos-agent + ventoos-core（服务层）

每个子 agent 负责：
1. 读取自己 crate 的 warning 详情
2. 按决策树判断每个 warning 的性质
3. 执行修复
4. 验证 `cargo clippy -p <crate>` 通过

主 agent 负责：
1. 汇总所有修复结果
2. 运行 workspace 级 `cargo clippy` 和 `cargo test`
3. 输出完成报告

## 常见 Warning 速查表

| Warning | 原因 | 修复方式 |
|---|---|---|
| `unused import` | 导入未使用 | 删除 import 行 |
| `unused variable` | 变量未使用 | 加前缀 `_` 或删除 |
| `field is never read` | 结构体字段未使用 | 判断预留/删除/加 allow |
| `unused async` | async 函数无 await | 移除 async，同步调用处去掉 .await |
| `unused self` | trait 方法未用 self | trait 需要就加 allow，否则改签名 |
| `casting ... may truncate` | 类型转换可能截断 | try_into().unwrap_or(...) 或加 allow |
| `redundant closure` | 闭包可简化为方法引用 | 替换为 `Type::method` |
| `identical match arms` | match 分支重复 | 合并分支或提取公共函数 |
| `function too many lines` | 函数过长 | 提取子函数，或加 #[allow] |
| `function too many arguments` | 参数过多 | 封装为 struct，或加 #[allow] |

## 禁止操作

- 不要为消除 warning 而破坏 API 兼容性（如公开函数改签名未检查调用方）
- 不要把 `unsafe` 代码的 warning 用 #[allow] 简单屏蔽，必须评估安全性
- 不要删除被 `#[cfg(test)]` 条件编译包裹的 "unused" 代码

## 输出标准

完成后必须报告：
1. 修复前 warning 总数与按 crate 分布
2. 自动修复数量（cargo clippy --fix）
3. 手动修复数量与分类
4. 剩余未修复项及原因（如 API 稳定期不便改动）
5. `cargo clippy --workspace` 最终结果
6. `cargo test --workspace` 最终结果
