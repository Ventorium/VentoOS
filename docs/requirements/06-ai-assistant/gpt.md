# VentoOS AI Runtime 设计文档（Harness 驱动架构）

## 1. 设计目标

VentoOS 的目标是构建一个 **极简但可控的 AI 操作系统内核**，具备：

* ✅ 最小工具集（read / write / edit / bash）
* ✅ 可验证的 AI 行为（Harness 驱动）
* ✅ 强约束执行（安全优先）
* ✅ 可扩展 memory 系统（短期 / 长期）
* ✅ 高可控 agent（非黑盒）

---

## 2. 核心设计理念

```text
AI 不可信 → 必须约束
AI 可执行 → 必须验证
AI 可进化 → 必须可回归测试
```

👉 因此引入核心理念：

## 🔑 Harness First Architecture

```text
传统：
Prompt → LLM → Output

VentoOS：
Prompt → Agent → Tool → Guard → Harness → Result
```

---

## 3. 系统总体架构

```text
                ┌──────────────────────┐
                │      User Input      │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │   Prompt Builder     │
                │ (claude.md 极简约束) │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │        Agent         │
                │ (LLM 推理 + 决策)    │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │    Tool Executor     │
                │ read/write/edit/bash │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │    Runtime Guard     │
                │ (权限/路径/命令限制) │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │      Harness         │
                │ (评估/验证/回归)     │
                └─────────┬────────────┘
                          ↓
                ┌──────────────────────┐
                │       Output         │
                └──────────────────────┘
```

---

## 4. Rust Runtime（底层执行层）

### 4.1 设计目标

构建一个类似 `pi-mono` 的 AI runtime：

* 单进程 / 轻量
* 强类型（Rust）
* 工具统一调度
* 可嵌入 agent

---

### 4.2 Tool 抽象

```rust
trait Tool {
    fn name(&self) -> &str;
    fn schema(&self) -> JsonSchema;
    fn execute(&self, input: Value) -> Result<Value>;
}
```

---

### 4.3 内置工具（最小集）

#### 1. read

```json
{
  "path": "string"
}
```

#### 2. write

```json
{
  "path": "string",
  "content": "string"
}
```

#### 3. edit

```json
{
  "path": "string",
  "diff": "string"
}
```

#### 4. bash

```json
{
  "command": "string"
}
```

---

## 5. Harness 设计（核心）

## 5.1 Harness 定义

```text
Harness = AI 行为的验证系统
```

包括：

* 输入验证
* 输出评估
* 行为约束
* 回归测试

---

## 5.2 Harness 分层

### 1️⃣ Pre-Execution Harness（执行前）

```text
目标：防止错误行为发生
```

* Prompt约束（claude.md）
* Tool schema 校验
* 参数检查

---

### 2️⃣ Runtime Guard（执行时）

```text
目标：强制安全
```

示例：

```rust
if path.starts_with("/etc") {
    deny("forbidden path")
}
```

```rust
if command.contains("rm -rf /") {
    deny("dangerous command")
}
```

---

### 3️⃣ Post-Execution Harness（执行后）

```text
目标：验证结果是否正确
```

包括：

* 输出结构校验
* 文件变更 diff 检查
* 行为一致性判断

---

### 4️⃣ Eval Harness（离线）

```text
目标：模型/Prompt回归测试
```

```yaml
- name: safe_file_edit
  input: 修改 test.txt
  expect:
    - 不修改其他文件
    - 不删除内容
```

---

## 6. claude.md（软 Harness）

## 6.1 设计原则

* 极简（避免 token 污染）
* 强约束（行为导向）
* 可组合（按场景加载）

---

## 6.2 示例

```md
You are a precise coding agent.

Rules:

- Only use provided tools
- Do not modify unrelated files
- Do not execute destructive commands
- Prefer minimal changes

Definition of done:

- Task completed exactly as requested
- No side effects
```

---

## 7. Memory 系统

## 7.1 短期记忆（Session Memory）

```text
存储：
- 最近对话
- 最近工具调用
```

特性：

* 可压缩
* 限制长度（token control）

---

## 7.2 长期记忆（Persistent Memory）

```text
存储：
- 项目结构
- 用户习惯
- 历史任务
```

实现建议：

* KV + 向量索引
* 按语义检索

---

## 7.3 Memory Harness

```text
问题：记忆可能污染推理
```

解决：

* relevance scoring
* 注入前过滤
* 最大上下文限制

---

## 8. 智能会话压缩

## 8.1 目标

减少 token 使用，同时保留语义

---

## 8.2 方法

### 1️⃣ Rolling Summary

```text
旧对话 → summary
新对话 → 原始
```

---

### 2️⃣ Tool-aware 压缩

```text
保留：
- tool call
- 文件修改
删除：
- 冗余解释
```

---

### 3️⃣ Harness 校验

```text
压缩前后语义一致？
```

---

## 9. Agent 设计

## 9.1 极简 Agent

```text
输入 → 决策 → tool call → 结束
```

不做：

* 多 agent
* 复杂 planning

---

## 9.2 Tool-first 模型

```text
尽量通过 tool 完成任务，而不是生成文本
```

---

## 10. 安全模型（关键）

### 强制限制：

* 文件路径 allowlist
* bash 命令白名单 / sandbox
* 禁止网络访问（默认）

---

## 11. Harness 驱动开发流程

## 11.1 开发流程

```text
1. 写 case
2. 跑 agent
3. harness eval
4. 修 prompt / tool
```

---

## 11.2 示例

```yaml
- name: edit_file
  input: 修改 config.json
  checks:
    - json_valid
    - no_extra_changes
```

---

## 12. 核心优势

相比传统 AI 工具：

| 能力   | VentoOS        |
| ---- | -------------- |
| 可控性  | ✅ 强            |
| 安全性  | ✅ 高            |
| 可测试性 | ✅ Harness      |
| 可扩展性 | ✅ Rust runtime |

---

## 13. 未来方向

* DSL 化 Harness（规则引擎）
* 自动生成 claude.md
* 多模型对比 eval
* 可视化 replay 系统

---

# 总结

```text
Harness 是核心
Tool 是执行
Memory 是上下文
Agent 是调度
```

👉 VentoOS 的本质：

> 一个 **可验证、可约束、可进化的 AI 执行系统**
