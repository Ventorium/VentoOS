# AI Agent 系统架构设计

> 模块：ai-agent  
> 前端：web/src/apps/ai-assistant/ + web/src/shell/AISidePanel/  
> 后端：native/crates/ventoos-agent/  
> 版本：v2.0

---

## 1. 职责

AI Agent 系统是 VentoOS 的智能助手核心，提供：

- 多 Provider 支持（OpenAI / Anthropic / Gemini / 自定义）
- ReAct Agent 引擎（Tool Call 路由）
- 平台业务 Tool 集（K8s / DB / Redis / VFS / 系统）
- 流式对话（SSE）
- Markdown 渲染与代码高亮
- 危险操作确认机制
- 上下文注入
- 语音输入与多模态支持
- 悬浮侧边栏 + 完整工作台

---

## 2. 后端架构

### 2.1 Crate 结构

```
ventoos-agent/
├── src/
│   ├── lib.rs             # 公共导出
│   ├── routes.rs          # Axum 路由定义
│   ├── manager.rs         # AgentManager
│   ├── agent.rs           # ReAct Agent 引擎
│   ├── provider.rs        # LLM Provider 抽象
│   ├── session.rs         # 会话管理
│   ├── channel/           # 外部渠道集成（飞书/企微）
│   ├── guard.rs           # 安全守卫
│   ├── tool.rs            # Tool 定义与路由
│   ├── tools/             # (NEW) 平台 Tool 集
│   │   ├── mod.rs
│   │   ├── k8s_tools.rs   # K8s 资源查询/操作
│   │   ├── db_tools.rs    # 数据库查询/Schema 浏览
│   │   ├── redis_tools.rs # Redis 读写/查询
│   │   ├── vfs_tools.rs   # 文件读写/搜索
│   │   ├── system_tools.rs # 窗口/通知/上下文
│   │   ├── file_tools.rs  # 基础文件操作
│   │   └── shell_tools.rs # 命令执行
│   └── executor.rs        # (NEW) 真实 Tool 执行器
└── tests/
    ├── integration.rs
    ├── tool_tests.rs
    └── docker-compose.yml
```

### 2.2 Tool 注册体系

```rust
pub trait ToolDefinition: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> serde_json::Value;  // JSON Schema
    fn risk_level(&self) -> RiskLevel;           // Low | Medium | High
}

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(
        &self,
        name: &str,
        args: serde_json::Value,
        context: &ExecutionContext,
    ) -> Result<ToolResult>;
}

pub enum RiskLevel {
    Low,      // 只读操作：list, get, describe
    Medium,   // 有限写操作：创建资源、写文件
    High,     // 危险操作：删除、drop table、kubectl delete
}
```

### 2.3 平台 Tool 清单

```
# K8s Tools
k8s_list_clusters         → 列举集群          (Low)
k8s_list_namespaces       → 列举命名空间      (Low)
k8s_list_resources        → 列举资源          (Low)
k8s_get_resource          → 获取资源详情      (Low)
k8s_get_resource_yaml     → 获取 YAML        (Low)
k8s_apply_yaml            → 应用 YAML        (High)
k8s_delete_resource       → 删除资源          (High)
k8s_get_pod_logs          → 获取 Pod 日志     (Low)
k8s_exec_command          → 在 Pod 中执行命令 (High)
k8s_port_forward          → 端口转发          (Medium)
k8s_scale                 → 扩缩容            (High)

# Database Tools
db_list_connections       → 列举连接          (Low)
db_list_schemas           → 列举 Schema       (Low)
db_list_tables            → 列举表            (Low)
db_describe_table         → 描述表结构        (Low)
db_execute_query          → 执行 SQL          (Medium)
db_execute_write          → 执行写 SQL        (High)

# Redis Tools
redis_list_connections    → 列举连接          (Low)
redis_get_key             → 获取键值          (Low)
redis_set_key             → 设置键值          (Medium)
redis_delete_key          → 删除键            (High)
redis_execute_command     → 执行命令          (Medium)

# VFS Tools
vfs_list_mounts           → 列举挂载点        (Low)
vfs_list_directory        → 列举目录          (Low)
vfs_read_file             → 读取文件          (Low)
vfs_write_file            → 写入文件          (Medium)
vfs_delete                → 删除文件/目录     (High)
vfs_search                → 搜索文件          (Low)

# System Tools
system_open_window        → 打开应用窗口      (Low)
system_notify             → 发送通知          (Low)
system_get_context        → 获取当前上下文     (Low)
system_get_active_window  → 获取活跃窗口信息   (Low)
```

### 2.4 危险操作确认流程

```
Agent Engine → Tool Call (RiskLevel::High)
  → Guard 检查 → 需要确认
  → WebSocket 发送 { type: "agent_confirm", tool, args, session_id }
  → Frontend 弹出确认对话框
  → 用户 Approve/Deny
  → WebSocket 返回 { type: "agent_confirm_response", approved }
  → Agent Engine 继续/中止
```

---

## 3. 前端架构

### 3.1 组件结构

```
apps/ai-assistant/
├── index.tsx                  # 完整工作台
├── components/
│   ├── ChatMessages.tsx       # 消息列表
│   ├── MessageBubble.tsx      # 消息气泡
│   ├── MarkdownRenderer.tsx   # Markdown 渲染 (NEW)
│   ├── CodeBlock.tsx          # 代码块高亮 (NEW)
│   ├── ToolCallCard.tsx       # Tool Call 可视化
│   ├── ConfirmDialog.tsx      # 危险操作确认 (NEW)
│   ├── ChatInput.tsx          # 输入框
│   ├── VoiceInput.tsx         # 语音输入 (NEW)
│   ├── ImageUpload.tsx        # 图片上传 (NEW)
│   ├── ContextInjector.tsx    # 上下文注入 (NEW)
│   ├── SessionList.tsx        # 会话列表
│   └── ProviderSettings.tsx   # Provider 配置
├── hooks/
│   ├── useChat.ts
│   ├── useVoice.ts            # (NEW)
│   └── useConfirm.ts          # (NEW)
└── types.ts

shell/AISidePanel/
├── index.tsx                  # 悬浮侧边栏
└── components/
    ├── QuickChat.tsx          # 快速对话
    └── ContextPreview.tsx     # 上下文预览
```

### 3.2 Markdown 渲染

```typescript
// MarkdownRenderer.tsx
// 使用 react-markdown + remark-gfm + rehype-highlight
// 支持：
// - 标题、段落、列表
// - 代码块（语法高亮，支持复制按钮）
// - 表格
// - 链接
// - 图片
// - LaTeX 公式
// - Mermaid 图表（可选）

interface MarkdownRendererProps {
  content: string
  streaming?: boolean  // 流式输入时逐字渲染
}
```

### 3.3 上下文注入

```
用户在 K8s App 查看 Pod YAML
  → 点击「发送到 AI」按钮
  → ContextInjector 收集当前内容
  → 自动填入 AI 输入框
  → 附加上下文标签：[K8s] nginx-pod YAML

支持的上下文源：
- K8s 资源 YAML
- SQL 查询结果
- Redis 键值
- 文件内容
- 终端输出
```

---

## 4. 测试策略

### 4.1 后端集成测试

Mock LLM Server：
- Docker 启动一个 HTTP 服务模拟 OpenAI API
- 返回预设的 tool call 响应

测试场景：
- Tool 注册与发现
- Tool 路由分发
- K8s Tool 执行（连接 kind 集群）
- DB Tool 执行（连接 Docker PostgreSQL）
- Redis Tool 执行（连接 Docker Redis）
- VFS Tool 执行（连接 Docker SFTP）
- 危险操作拦截（High risk → 需确认）
- Guard 规则匹配（路径白名单、命令黑名单）
- 会话持久化与恢复
- 流式响应处理

### 4.2 前端测试

- Markdown 渲染（GFM 表格、代码块、列表）
- 代码块语法高亮 + 复制按钮
- Tool Call 卡片展开/折叠
- 确认对话框交互
- 语音输入按钮状态
- 上下文注入预填充
- 会话列表增删切换
- 流式消息逐字显示
