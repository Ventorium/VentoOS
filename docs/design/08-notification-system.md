# 通知系统架构设计

> 模块：notification  
> 前端：web/src/shell/NotificationCenter/ + web/src/services/notification/  
> 版本：v2.0

---

## 1. 职责

通知系统负责统一的消息推送与展示：

- 通知中心面板（右上角下拉）
- Toast 浮层通知
- 长操作完成通知
- AI Agent 执行结果通知
- K8s 事件告警通知
- 浏览器原生 Notification API
- 按严重程度过滤

---

## 2. 架构设计

### 2.1 通知管道

```
通知来源：
├── 后端 WebSocket 推送
│   ├── K8s watch 事件（Warning 级别）
│   ├── 任务完成/失败
│   ├── AI Agent 工具执行结果
│   └── 连接状态变更
├── 前端本地生成
│   ├── 文件传输完成
│   ├── SQL 导出完成
│   ├── 操作成功/失败反馈
│   └── 应用通知
└── 系统通知
    ├── 更新提示
    └── 安全警告

通知管道处理：
NotificationChannel
  → 去重（5s 内相同消息合并）
  → 严重程度分类（info/success/warning/error）
  → 持久化到 Store
  → Toast 展示（info/success: 3s, warning: 5s, error: 不自动关闭）
  → 可选：浏览器原生 Notification
```

### 2.2 数据模型

```typescript
interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  source: NotificationSource
  timestamp: Date
  read: boolean
  actions?: NotificationAction[]  // 可操作按钮
  metadata?: Record<string, unknown>
}

type NotificationSource =
  | { kind: 'k8s'; cluster: string; resource?: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'ai'; sessionId: string }
  | { kind: 'connection'; connId: string }
  | { kind: 'vfs'; mountId: string; path?: string }
  | { kind: 'system' }

interface NotificationAction {
  label: string
  action: () => void  // 点击回调
}
```

### 2.3 浏览器原生 Notification

```typescript
// 条件：用户授权 + 页面不在焦点
async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function showNativeNotification(notification: Notification) {
  if (document.hasFocus()) return  // 页面在焦点时不弹
  new window.Notification(notification.title, {
    body: notification.message,
    icon: '/favicon.ico',
    tag: notification.id,  // 去重
  })
}
```

### 2.4 过滤机制

```typescript
interface NotificationFilter {
  types: Set<'info' | 'success' | 'warning' | 'error'>
  sources: Set<string>  // k8s | task | ai | connection | vfs | system
  readStatus: 'all' | 'unread' | 'read'
  dateRange?: { start: Date; end: Date }
}
```

---

## 3. K8s 事件告警

### 3.1 后端 Watch

```rust
// ventoos-k8s/src/watch.rs
async fn watch_k8s_events(
    client: &kube::Client,
    namespace: &str,
    tx: &broadcast::Sender<WsMessage>,
) {
    let events: Api<Event> = Api::namespaced(client, namespace);
    let mut stream = events.watch(&Default::default(), "0").await?;

    while let Some(event) = stream.try_next().await? {
        if let WatchEvent::Added(ev) | WatchEvent::Modified(ev) = event {
            if ev.type_ == Some("Warning".to_string()) {
                tx.send(WsMessage::Notification {
                    type_: "warning",
                    title: format!("{}: {}", ev.regarding.unwrap().name, ev.reason),
                    message: ev.note.unwrap_or_default(),
                    source: "k8s",
                })?;
            }
        }
    }
}
```

### 3.2 前端接收

```
WebSocket → WsMessage::Notification
  → NotificationChannel.send(notification)
  → NotificationStore.add(notification)
  → Toast 展示
  → K8s App 内资源列表刷新
```

---

## 4. 测试策略

### 4.1 前端测试

- 通知创建与存储
- Toast 展示与自动关闭
- 通知中心面板打开/关闭
- 标记已读/全部已读
- 按严重程度过滤
- 按来源过滤
- 通知操作按钮点击
- 浏览器 Notification API 触发条件
- 通知去重逻辑
