# 任务引擎架构设计

> 模块：task  
> 前端：web/src/services/task/  
> 后端：native/crates/ventoos-task/  
> 版本：v2.0

---

## 1. 职责

任务引擎管理 VentoOS 中所有长时间运行的异步操作：

- 文件传输（跨挂载点复制/移动）
- SQL 导出
- K8s 资源操作（批量删除等）
- AI Agent 工具执行
- 批量 Redis 操作
- 任务进度追踪
- 通知集成

---

## 2. 后端架构

### 2.1 数据模型

```rust
pub struct Task {
    pub id: Uuid,
    pub task_type: TaskType,
    pub title: String,
    pub status: TaskStatus,
    pub progress: f32,         // 0.0 ~ 1.0
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub metadata: serde_json::Value,
}

pub enum TaskType {
    FileTransfer,
    SqlExport,
    K8sOperation,
    RedisOperation,
    AgentExecution,
    Backup,
}

pub enum TaskStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}
```

### 2.2 TaskManager

```rust
pub struct TaskManager {
    tasks: Arc<RwLock<HashMap<Uuid, Task>>>,
    queue: Arc<Mutex<VecDeque<Uuid>>>,
    max_concurrent: usize,
    ws_tx: broadcast::Sender<WsMessage>,
    notification_tx: mpsc::Sender<Notification>,
}

impl TaskManager {
    pub async fn submit(&self, task: Task) -> Uuid;
    pub async fn cancel(&self, task_id: Uuid) -> Result<()>;
    pub async fn pause(&self, task_id: Uuid) -> Result<()>;
    pub async fn resume(&self, task_id: Uuid) -> Result<()>;
    pub fn list(&self) -> Vec<Task>;
    pub fn get(&self, task_id: Uuid) -> Option<Task>;
}
```

### 2.3 进度推送

```
Task progress update
  → TaskManager.update_progress(task_id, progress)
  → WebSocket broadcast { type: "task_update", task_id, progress, status }
  → Frontend TaskCenter UI 更新
  → 任务完成时 → NotificationChannel.send()
```

---

## 3. 前端架构

### 3.1 TaskCenter

```typescript
// TopBar → TaskCenter 下拉面板
interface TaskCenterProps {
  // 展示所有进行中/最近完成的任务
  // 进度条 + 操作按钮（取消/暂停）
}

// WebSocket 接收 task_update 事件
// 更新 TaskStore
// 任务完成 → Toast 通知
```

---

## 4. 测试策略

### 4.1 后端测试

- 任务提交与队列
- 并发限制（max_concurrent）
- 任务取消/暂停/恢复
- 进度更新与 WebSocket 推送
- 任务完成通知
- 失败重试
