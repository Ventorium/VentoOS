# API Client — 产品需求文档 (PRD)

> 版本：v1.0
> 目标：构建一个功能完备的 API 测试工具应用，对标 Hoppscotch / Postman，数据全部存本地，请求由 Rust 后端代理执行
> 视觉主题：严格遵循 VentoOS 系统统一主题，不单独定义配色与字体

---

## 1. 产品定位与核心目标

### 1.1 定位

API Client 是 VentoOS 内置的 API 测试与调试工具，面向开发者和运维人员，提供完整的 HTTP/WebSocket/SSE/GraphQL 请求构造、发送、调试能力。定位为本机 Postman 替代品，数据完全存储在本地，无需云端账号。

### 1.2 核心目标

1. **完整的 API 测试能力**：支持 REST、GraphQL、WebSocket、SSE、gRPC 等协议
2. **本地优先**：所有数据（合集、请求、环境变量、历史）存储在本地 SQLite
3. **OpenAPI 导入**：支持从 OpenAPI/Swagger 规范文件导入为合集
4. **脚本能力**：支持前置脚本和后置脚本，后置脚本可修改环境变量
5. **替代 Postman**：提供同等丰富度的功能（代码生成、批量执行、Mock 等）
6. **工作区状态可恢复**：请求标签、活动栏视图、环境选择、响应快照、WebSocket/MQTT 会话草稿与日志必须写入本地数据库，刷新后可恢复

### 1.3 与 Hoppscotch 的差异点

| 维度 | Hoppscotch | VentoOS API Client |
|------|------------|-------------------|
| 请求执行 | 浏览器直接发送（受 CORS 限制） | Rust 后端代理发送（无 CORS 限制） |
| 数据存储 | IndexedDB / 云端同步 | 本地 SQLite（ventoos-persist） |
| 脚本沙箱 | JS Sandbox（浏览器端） | Rust 端 JS 沙箱（boa_engine）或受限前端沙箱 |
| OpenAPI 导入 | 已支持 | 增强支持（自动生成示例、分组映射） |
| 后置脚本修改环境变量 | 支持但入口不明显 | 显式支持，在 UI 上突出 |
| 部署方式 | SaaS / 自托管 | VentoOS 内置应用 |

---

## 2. 设计规范（遵循 VentoOS 系统主题）

### 2.1 主题说明

本应用不定义独立配色，全部使用 VentoOS 系统 CSS Variables：
- `var(--vos-bg-primary)`、`var(--vos-bg-secondary)`、`var(--vos-bg-elevated)`
- `var(--vos-text-primary)`、`var(--vos-text-secondary)`、`var(--vos-text-tertiary)`
- `var(--vos-border)`、`var(--vos-primary)`
- 状态色沿用系统状态色

**HTTP 方法色彩标识**（行业惯例，使用语义色）：
- GET: `var(--vos-success)` 绿色
- POST: `var(--vos-warning)` 橙色
- PUT: `var(--vos-info)` 蓝色
- PATCH: 紫色（`#a855f7`，唯一例外，因系统无紫色语义变量）
- DELETE: `var(--vos-error)` 红色
- OPTIONS/HEAD: `var(--vos-text-tertiary)` 灰色

**禁止在应用内写死其他任何十六进制色值。**

### 2.2 间距与尺寸

- 左侧边栏宽度：280px（可拖拽调整，最小 200px，最大 400px）
- 顶部请求 URL 栏高度：48px
- 标签栏高度：36px
- 请求/响应面板：上下分割，可拖拽调整比例，默认各 50%
- 行高：32px（列表项）、28px（表格行）
- 图标尺寸：16px（内容区）、14px（树形节点）

---

## 3. 全局布局架构

### 3.0 协议 Activity Bar（新增）

应用最左侧增加一条类似 VS Code 的 Activity Bar，作为 API Client 的一级功能导航。

**从上到下：**
- HTTP
- WebSocket
- MQTT

**从下到上：**
- Guide / Docs

**交互规范：**
- 图标悬浮显示标题
- 右键当前图标可配置显示/隐藏哪些协议入口
- 隐藏最后一个可见协议入口时应阻止操作
- 当当前协议入口被隐藏时，自动切换到下一个可见入口
- 该能力抽象为前端通用 UIKit，可被 Explorer、Monaco、Database、Redis 等应用复用

### 3.1 布局层级

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [协议 Activity Bar] [HTTP 侧栏] [标签栏 / 协议工作区]                     │
├──────┬──────────────┬───────────────────────────────────────────────────┤
│HTTP  │ Collections  │ [标签栏] 多标签页：每个打开的请求一个标签            │ h=36px
│WS    │ Environments ├───────────────────────────────────────────────────┤
│MQTT  │ History      │ [请求 URL 栏] / [协议连接栏]                        │ h=48px
│      │              │ ┌─────┬──────────────────────────┬──────────────┐ │
│Guide │              │ │ GET▼│ https://api.example.com  │ Send / Connect│ │
│w=40px│ w=260~280px  │ └─────┴──────────────────────────┴──────────────┘ │
│      │              ├───────────────────────────────────────────────────┤
│      │              │ [工作区] HTTP Params/Headers/Body/Auth/Scripts    │
│      │              │         或 WebSocket / MQTT 消息日志与发送面板     │
│      │              ├─ ─ ─ ─ ─ ─ ─ ─ [可拖拽分割线，仅 HTTP 必需] ─ ─ ──┤
│      │              │ [响应区 / 日志区] Body │ Headers │ Variables      │
└──────┴──────────────┴───────────────────────────────────────────────────┘
```

### 3.2 布局状态与响应

- **协议 Activity Bar**：固定 40px 宽度，支持右键配置可见协议入口
- **HTTP 左侧栏**：可折叠/展开，拖拽调整宽度
- **请求/响应分割**：上下拖拽调整比例，支持最大化请求区或响应区
- **标签栏**：水平滚动，支持拖拽排序、关闭、右键菜单
- **底部状态栏**（可选）：显示当前环境、代理状态

### 3.3 状态持久化原则（新增）

- 页面与组件不是唯一状态源，业务状态必须进入应用 store，并同步到后端数据库持久化层
- HTTP 工作区需持久化：tabs、activeTab、sidebarTab、activeEnvironment、response snapshot
- 协议工作区需持久化：activeView、hiddenProtocols、WebSocket/MQTT 的连接配置、消息草稿、日志、连接/订阅意图
- 刷新页面后，应用必须从数据库恢复上述状态，继续当前工作上下文
- 单窗口应用优先复用 window appState → SQLite 链路；领域数据仍由 API Client 独立 SQLite 表负责

---

## 4. 合集管理（Collections）

### 4.1 数据模型

```
Collection（合集）
├── id: string (UUID)
├── name: string
├── description: string | null
├── auth: AuthConfig | null          // 继承给子项
├── headers: Header[]                // 继承给子项
├── variables: CollectionVariable[]  // 合集级变量
├── preRequestScript: string | null  // 合集级前置脚本
├── testScript: string | null        // 合集级后置脚本
├── folders: Folder[]                // 递归目录结构
├── requests: Request[]              // 根级请求
├── sortOrder: number
├── createdAt: timestamp
└── updatedAt: timestamp

Folder（目录）
├── id: string (UUID)
├── name: string
├── description: string | null
├── auth: AuthConfig | null          // 可覆盖或继承
├── headers: Header[]                // 可覆盖或继承
├── variables: CollectionVariable[]
├── preRequestScript: string | null
├── testScript: string | null
├── folders: Folder[]                // 无限嵌套
├── requests: Request[]
└── sortOrder: number
```

### 4.2 合集树形视图

**布局：**
- 树形列表，缩进 16px/层级
- 每个节点：图标 + 名称 + HTTP 方法徽标（请求节点）
- 合集/文件夹节点可展开/折叠

**交互：**
- 单击请求：在标签页中打开（或切换到已打开的标签）
- 双击合集/文件夹：展开/折叠
- 右键菜单：
  - 合集级：新建请求、新建文件夹、导入、导出、复制、重命名、删除
  - 文件夹级：新建请求、新建子文件夹、复制、重命名、删除
  - 请求级：复制、复制为 cURL、移动、重命名、删除
- 拖拽排序：支持请求和文件夹在同级内拖拽排序、跨目录移动
- 搜索过滤：顶部搜索框，实时过滤合集/请求名称

**状态：**
- 选中高亮（当前打开的请求）
- 修改未保存标记（圆点指示器）
- 空态：提示创建第一个合集

### 4.3 创建流程

1. 点击侧栏「+」按钮 → 弹出菜单：新建合集 / 导入合集
2. 新建合集：输入名称、描述 → 创建后自动展开
3. 在合集内「+」→ 新建请求 / 新建文件夹
4. 新建请求：选择 HTTP 方法 → 自动打开新标签

---

## 5. 请求编辑器（Request Editor）

### 5.1 URL 栏

**布局：**
```
┌──────┬──────────────────────────────────────────┬──────┬──────┐
│ GET▼ │ {{baseUrl}}/api/users?page=1             │ Save │ Send │
└──────┴──────────────────────────────────────────┴──────┴──────┘
```

**组件：**
- HTTP 方法选择器（下拉）：GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, CONNECT, TRACE, CUSTOM
- URL 输入框：支持环境变量插值（`{{varName}}`），自动补全变量名
- Save 按钮：保存到当前合集（Ctrl+S）
- Send 按钮：发送请求（Ctrl+Enter）
- URL 自动解析：自动提取 query parameters 到 Params 面板

### 5.2 请求配置标签页

#### 5.2.1 Params（查询参数）

**布局：** Key-Value 表格编辑器

| 启用 | Key | Value | Description | 操作 |
|------|-----|-------|-------------|------|
| ☑ | page | 1 | 页码 | 🗑️ |
| ☑ | size | 20 | 每页条数 | 🗑️ |
| ☐ | | | | |

**交互：**
- 最后一行为空行，输入后自动追加新行
- 勾选/取消勾选控制是否包含在请求中
- 编辑自动同步到 URL 栏
- 支持批量编辑（切换为文本模式，每行 `key=value`）

#### 5.2.2 Headers（请求头）

**布局：** 同 Params 的 Key-Value 表格

**特性：**
- Key 输入自动补全常用 Header 名（Content-Type, Authorization, Accept 等）
- 显示自动生成的 Header（灰色，如 Content-Type from body type）
- 支持批量编辑文本模式

#### 5.2.3 Body（请求体）

**类型选择器（单选）：**
- none
- form-data (multipart/form-data)
- x-www-form-urlencoded
- JSON (application/json)
- XML (application/xml)
- Raw (text/plain)
- Binary (application/octet-stream)
- GraphQL

**JSON/XML/Raw 编辑器：**
- 使用 Monaco Editor
- 语法高亮、格式化、折叠
- 环境变量插值高亮

**form-data 编辑器：**
- Key-Value 表格 + 文件上传支持
- 每行可选择 Text / File 类型
- File 类型显示文件选择器

**Binary 编辑器：**
- 文件选择区域（拖拽或点击上传）
- 显示文件名、大小

#### 5.2.4 Authorization（认证）

**类型选择器（下拉）：**
| 类型 | 配置字段 |
|------|---------|
| No Auth | 无 |
| Inherit from parent | 无（显示继承来源） |
| Basic Auth | Username, Password |
| Bearer Token | Token |
| API Key | Key, Value, Add to (Header/Query Params) |
| OAuth 2.0 | Grant Type, Auth URL, Token URL, Client ID, Client Secret, Scope, PKCE |
| AWS Signature | Access Key, Secret Key, Region, Service |
| Digest Auth | Username, Password, Realm, Nonce, Algorithm |

**OAuth 2.0 增强：**
- 支持 Authorization Code（含 PKCE）、Client Credentials、Password Grant、Implicit Flow
- 内置回调 URL 处理（Rust 后端启动临时 HTTP 服务接收回调）
- Token 自动刷新
- Token 查看器（解码 JWT 显示 payload）

#### 5.2.5 Scripts（脚本）

**双标签：Pre-request / Post-response**

**Pre-request Script：**
- Monaco Editor，语言 JavaScript
- 可用 API：
  ```js
  // 访问/修改请求
  vc.request.url
  vc.request.method
  vc.request.headers.add(key, value)
  vc.request.body.set(data)
  
  // 环境变量
  vc.env.get("varName")
  vc.env.set("varName", "value")
  
  // 全局变量
  vc.globals.get("key")
  vc.globals.set("key", "value")
  
  // 工具函数
  vc.utils.uuid()
  vc.utils.timestamp()
  vc.utils.randomInt(min, max)
  vc.utils.base64Encode(str)
  vc.utils.base64Decode(str)
  vc.utils.md5(str)
  vc.utils.sha256(str)
  ```

**Post-response Script（重点功能）：**
- Monaco Editor，语言 JavaScript
- 可用 API（在 Pre-request 基础上增加）：
  ```js
  // 访问响应
  vc.response.status        // 200
  vc.response.statusText    // "OK"
  vc.response.headers       // Map
  vc.response.body          // string
  vc.response.json()        // parsed JSON
  vc.response.time          // 响应时间 ms
  vc.response.size          // 响应大小 bytes
  
  // 修改环境变量（重点能力）
  vc.env.set("token", vc.response.json().access_token)
  vc.env.set("userId", vc.response.json().data.id)
  
  // 测试断言
  vc.test("Status is 200", () => {
    vc.expect(vc.response.status).toBe(200)
  })
  vc.test("Response has data", () => {
    vc.expect(vc.response.json().data).toBeDefined()
  })
  vc.test("Token is string", () => {
    vc.expect(typeof vc.response.json().token).toBe("string")
  })
  ```

**UI 突出：**
- Post-response 标签显示变量修改预览
- 执行后在响应区「Variables Changed」面板显示变量变更列表
- 脚本执行控制台输出（console.log）显示在底部

#### 5.2.6 Variables（请求级变量）

- 请求级变量覆盖环境变量
- Key-Value 表格

---

## 6. 响应查看器（Response Viewer）

### 6.1 响应元信息栏

```
┌──────────────────────────────────────────────────────────────┐
│ 200 OK │ 152ms │ 2.3 KB │ [Copy] [Save as file]             │
└──────────────────────────────────────────────────────────────┘
```

- 状态码（带颜色：2xx 绿、3xx 蓝、4xx 橙、5xx 红）
- 响应时间（ms）
- 响应大小
- 操作按钮：复制响应、保存为文件

### 6.2 响应标签页

#### Body

**渲染模式：**
- **Pretty**：格式化 JSON/XML/HTML（Monaco Editor 只读模式）
- **Raw**：原始文本
- **Preview**：HTML 渲染预览（iframe 沙箱）
- **Visualize**：自定义可视化（由 Post-response 脚本控制）

**JSON 增强：**
- 可折叠/展开
- 路径复制（点击某字段可复制 JSONPath）
- 搜索（Ctrl+F）
- 大型 JSON 虚拟滚动

#### Headers

- 响应头 Key-Value 表格（只读）

#### Cookies

- 响应 Cookie 列表（Name, Value, Domain, Path, Expires, HttpOnly, Secure）

#### Test Results

- 测试用例列表：✅ / ❌ + 测试名称 + 耗时
- 通过/失败统计
- 失败详情（期望值 vs 实际值）

#### Variables Changed

- 显示脚本执行后环境变量的变更
- 格式：变量名 | 旧值 | 新值

---

## 7. 环境管理（Environments）

### 7.1 数据模型

```
Environment
├── id: string (UUID)
├── name: string                    // e.g. "Development", "Production"
├── variables: EnvironmentVariable[]
├── isGlobal: boolean               // 全局环境（始终生效）
├── sortOrder: number
├── createdAt: timestamp
└── updatedAt: timestamp

EnvironmentVariable
├── key: string
├── initialValue: string            // 初始值（存储到文件/导出时使用）
├── currentValue: string            // 当前值（运行时可被脚本修改）
├── secret: boolean                 // 是否为密钥（UI 上遮掩显示）
└── active: boolean
```

### 7.2 环境选择器

**位置：** URL 栏右侧或底部状态栏

**交互：**
- 下拉选择当前活动环境
- 快捷键切换环境
- 显示「No Environment」选项
- 全局环境始终生效，命名环境可叠加

### 7.3 环境编辑器

**布局：** HTTP 侧栏 Environments 标签 → 环境列表 + 当前环境变量编辑区

**功能：**
- 新建/复制/重命名/删除环境
- Key-Value 表格编辑变量
- Initial Value / Current Value 双列（Current Value 运行时可变）
- Secret 变量切换（密码输入模式）
- 导入/导出环境（JSON 格式）

### 7.4 响应值保存到环境变量（新增链路）

**目标：** 形成“登录 -> 提取 token -> 保存到环境 -> 后续 Bearer 复用”的完整工作流。

**交互：**
- 用户发送登录请求后，在响应 Body 中选中 token 值
- 右键弹出上下文菜单：`Save value to environment`
- 弹窗要求输入：目标环境、变量名、是否 Secret
- 保存后自动写入当前环境变量列表，并默认建议变量名为 `TOKEN`
- 后续在 Authorization → Bearer Token 中可直接输入 `{{TOKEN}}`

**验收链路：**
1. 创建或选择一个环境
2. 登录接口返回 token
3. 选中 token 值并右键保存为 `TOKEN`
4. 在另一个请求的 Bearer Token 中填写 `{{TOKEN}}`
5. 发送请求时自动解析为 `Authorization: Bearer <真实 token>`

### 7.5 变量解析优先级

1. 请求级变量（最高）
2. 文件夹级变量
3. 合集级变量
4. 当前命名环境变量
5. 全局环境变量（最低）

### 7.6 预设动态变量

| 变量名 | 值 |
|--------|------|
| `$timestamp` | 当前 Unix 时间戳 |
| `$isoTimestamp` | ISO 8601 时间 |
| `$randomUUID` | UUID v4 |
| `$randomInt` | 0-1000 随机整数 |
| `$randomString` | 随机字符串 |
| `$randomEmail` | 随机邮箱 |

---

## 8. 请求历史（History）

### 8.1 数据模型

```
HistoryEntry
├── id: string (UUID)
├── request: RequestSnapshot        // 完整的请求快照
├── response: ResponseSnapshot      // 响应快照（状态码、头、体）
├── duration: number                // 耗时 ms
├── timestamp: timestamp
└── starred: boolean                // 是否标星
```

### 8.2 历史面板

**位置：** 左侧栏「History」标签

**布局：**
- 按日期分组（今天、昨天、本周、更早）
- 每条：HTTP 方法徽标 + URL + 状态码 + 时间
- 搜索过滤
- 清空历史

**交互：**
- 单击：在新标签页打开（恢复为可编辑请求）
- 右键：复制为 cURL、保存到合集、删除
- 标星：标星历史不被自动清理

---

## 9. 导入/导出（Import/Export）

### 9.1 导入

**入口：** 侧栏合集区顶部「Import」按钮 / 菜单栏

**支持格式：**

| 格式 | 说明 |
|------|------|
| **OpenAPI 3.x / Swagger 2.x** | ⭐ 重点支持。解析 paths 为请求，tags 映射为文件夹 |
| **Postman Collection v2.1** | 兼容 Postman 导出格式 |
| **Postman Environment** | 导入为环境 |
| **Hoppscotch Collection** | 原生 JSON 格式 |
| **cURL** | 粘贴 cURL 命令解析为请求 |
| **HAR** | HTTP Archive 格式 |
| **Insomnia** | Insomnia 导出格式 |

**OpenAPI 导入增强（重点）：**

```
OpenAPI Spec
├── info → 合集名称、描述
├── servers → 环境变量 baseUrl
├── tags → 文件夹分组
├── paths → 请求列表
│   ├── path + method → 请求 URL + 方法
│   ├── parameters → Params / Headers
│   ├── requestBody → Body（根据 content-type 匹配）
│   │   └── schema → 自动生成示例 JSON
│   ├── security → Auth 配置
│   └── description → 请求描述
├── components/securitySchemes → Auth 类型配置
└── components/schemas → 用于生成示例数据
```

**导入流程：**
1. 选择文件或粘贴 URL（支持从 URL 拉取 OpenAPI spec）
2. 解析预览：显示将要导入的合集结构树
3. 选择导入目标：新建合集 / 合并到现有合集
4. 冲突处理：同名请求可选覆盖/跳过/重命名
5. 确认导入

### 9.2 导出

**支持格式：**
- Hoppscotch Collection JSON
- OpenAPI 3.0 Spec
- Postman Collection v2.1

**导出范围：**
- 单个请求
- 单个文件夹
- 整个合集
- 所有合集

---

## 10. 代码生成（Code Generation）

### 10.1 功能

将当前请求转换为各语言的代码片段。

**支持语言/库：**
| 语言 | 库 |
|------|-----|
| JavaScript | fetch, axios, jQuery |
| TypeScript | fetch, axios |
| Python | requests, http.client |
| Go | net/http |
| Rust | reqwest |
| Java | HttpClient, OkHttp |
| C# | HttpClient |
| PHP | cURL, Guzzle |
| Ruby | Net::HTTP |
| Swift | URLSession |
| Kotlin | OkHttp |
| cURL | 命令行 |
| PowerShell | Invoke-WebRequest |

### 10.2 UI

- 请求 URL 栏旁或请求配置区的「</>」按钮
- 弹出模态框 / 侧面板
- 左侧语言/库选择列表
- 右侧代码预览（Monaco Editor 只读，带语法高亮）
- 复制按钮

---

## 11. 批量执行 / Collection Runner

### 11.1 功能

运行整个合集或文件夹中的所有请求。

### 11.2 UI

**入口：** 合集右键菜单「Run Collection」/ 顶部工具栏

**配置面板：**
- 选择要运行的合集/文件夹
- 选择环境
- 迭代次数
- 延迟时间（ms）
- 是否执行脚本
- 是否保存响应

**执行面板：**
```
┌──────────────────────────────────────────────────────┐
│ Collection Runner                                     │
├──────────────────────────────────────────────────────┤
│ ▶ Running: My API Tests  (3/15)                      │
│                                                       │
│ ✅ GET /api/users          200  45ms  3 tests passed │
│ ✅ POST /api/users         201  89ms  2 tests passed │
│ 🔄 GET /api/users/1        ...  ...                  │
│ ⬜ PUT /api/users/1                                   │
│ ⬜ DELETE /api/users/1                                │
│ ...                                                   │
├──────────────────────────────────────────────────────┤
│ Summary: 2/15 passed │ 0 failed │ 13 remaining      │
│ [Stop] [Export Results]                               │
└──────────────────────────────────────────────────────┘
```

**结果导出：** JSON / CSV 格式

---

## 12. WebSocket & MQTT & SSE & GraphQL

### 12.0 协议切换

- HTTP、WebSocket、MQTT 通过最左侧 Activity Bar 切换
- 切换协议不会关闭应用窗口，只切换中部工作区与侧栏内容
- HTTP 保留合集/环境/历史侧栏，WebSocket 与 MQTT 使用实时日志工作区
- 协议切换不能丢失各自工作区状态，WebSocket/MQTT 的连接配置、草稿与日志需要保留
- 协议工作区状态需写入本地数据库，刷新后恢复到上次工作现场

### 12.1 WebSocket

**布局：** 类似 REST 请求，但分为连接管理 + 消息面板

```
┌──────┬──────────────────────────────────────┬─────────────┐
│ WS   │ ws://localhost:8080/ws               │ Connect     │
└──────┴──────────────────────────────────────┴─────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Messages                                                      │
│ ↑ [14:23:05] {"type":"ping"}                                 │
│ ↓ [14:23:05] {"type":"pong","data":"ok"}                     │
│ ↑ [14:23:10] {"type":"subscribe","channel":"events"}         │
│ ↓ [14:23:10] {"type":"subscribed","channel":"events"}        │
├──────────────────────────────────────────────────────────────┤
│ New Message: [JSON editor]                        [Send]     │
└──────────────────────────────────────────────────────────────┘
```

**功能：**
- 连接管理（连接/断开）
- 消息收发（JSON 格式化显示）
- 协议选择（ws / wss）
- 自定义 Headers
- 消息历史（带时间戳和方向标记）
- 消息搜索/过滤
- 连接配置、消息草稿、消息日志和连接意图持久化到本地数据库，刷新后恢复

### 12.2 MQTT

**布局：** Broker 连接栏 + Topic 订阅栏 + 发布面板 + Topic Log

```
┌────────────────────────────────────────────────────────────────┐
│ Broker URL                         │ Client ID │ Connect      │
├────────────────────────────────────────────────────────────────┤
│ Topic: ventoos/demo               │ Subscribe │ Publish      │
├────────────────────────────────────────────────────────────────┤
│ Publish Payload (JSON / Text)                                 │
├────────────────────────────────────────────────────────────────┤
│ Topic Log                                                       │
│ ↓ [topic] {"hello":"mqtt"}                                   │
│ ↑ [topic] {"from":"ventoos"}                                 │
└────────────────────────────────────────────────────────────────┘
```

**功能：**
- 通过 MQTT over WebSocket 连接公共或私有 Broker
- 配置 Client ID
- 订阅 Topic
- 发布消息到当前 Topic
- 显示消息方向、Topic、时间顺序日志
- 持久化 Broker、Client ID、Topic、Payload 草稿、日志和连接/订阅意图，刷新后恢复

### 12.3 Server-Sent Events (SSE)

- 连接到 SSE 端点
- 实时显示事件流
- 事件类型过滤
- 自动重连配置

### 12.4 GraphQL

**布局：**
```
┌──────┬──────────────────────────────────────┬─────────────┐
│ GQL  │ https://api.example.com/graphql      │ Send        │
└──────┴──────────────────────────────────────┴─────────────┘
┌──────────────────────┬───────────────────────────────────────┐
│ Schema Explorer      │ Query Editor (Monaco)                 │
│ ├─ Query             │ query GetUsers($page: Int!) {         │
│ │  ├─ users          │   users(page: $page) {                │
│ │  ├─ user           │     id                                │
│ │  └─ posts          │     name                              │
│ ├─ Mutation          │     email                             │
│ │  ├─ createUser     │   }                                   │
│ │  └─ updateUser     │ }                                     │
│ └─ Subscription      │                                       │
│                      ├───────────────────────────────────────┤
│                      │ Variables: {"page": 1}                │
│                      ├───────────────────────────────────────┤
│                      │ Headers                               │
└──────────────────────┴───────────────────────────────────────┘
```

**功能：**
- Schema 自动内省与文档浏览器
- Query/Mutation/Subscription 编辑
- 变量编辑器
- 自动补全（基于 Schema）
- 查询收藏

---

## 13. 其他增强功能

### 13.1 Cookie Jar

- 全局 Cookie 管理器
- 按域名组织
- 手动添加/编辑/删除 Cookie
- 请求自动带上匹配的 Cookie
- 响应自动存储 Set-Cookie

### 13.2 请求代理配置

- 支持 HTTP/HTTPS/SOCKS5 代理
- 全局代理设置
- 不走代理的域名白名单

### 13.3 请求超时配置

- 全局默认超时时间
- 每个请求可单独覆盖
- 连接超时 / 读取超时分别配置

### 13.4 客户端证书

- mTLS 支持
- 按域名配置客户端证书
- PEM / PKCS12 格式

### 13.5 请求重放

- 快速重发上一次请求（Ctrl+Shift+Enter）
- 修改后重发

### 13.6 快捷键

| 操作 | 快捷键 |
|------|--------|
| 发送请求 | Ctrl+Enter |
| 保存请求 | Ctrl+S |
| 新建请求 | Ctrl+N |
| 新建标签 | Ctrl+T |
| 关闭标签 | Ctrl+W |
| 切换标签 | Ctrl+1~9 |
| 格式化 Body | Ctrl+Shift+F |
| 搜索合集 | Ctrl+K |
| 切换环境 | Ctrl+E |
| 代码生成 | Ctrl+Shift+C |

---

## 14. Rust 后端架构

### 14.1 职责

前端不直接发送 HTTP 请求（避免 CORS 限制），所有请求通过 Rust 后端代理发送。

### 14.2 后端模块 (ventoos-api-client crate)

```
ventoos-api-client/
├── src/
│   ├── lib.rs              // 模块导出
│   ├── routes.rs           // Axum 路由注册
│   ├── proxy.rs            // HTTP 请求代理（reqwest）
│   ├── websocket.rs        // WebSocket 代理
│   ├── sse.rs              // SSE 代理
│   ├── graphql.rs          // GraphQL 代理（复用 proxy）
│   ├── script_engine.rs    // JS 脚本执行引擎（boa_engine）
│   ├── import/
│   │   ├── mod.rs
│   │   ├── openapi.rs      // OpenAPI/Swagger 解析
│   │   ├── postman.rs      // Postman 格式解析
│   │   ├── curl.rs         // cURL 解析
│   │   ├── har.rs          // HAR 解析
│   │   └── insomnia.rs     // Insomnia 解析
│   ├── export/
│   │   ├── mod.rs
│   │   ├── openapi.rs
│   │   └── postman.rs
│   ├── codegen/
│   │   ├── mod.rs
│   │   └── generators/     // 各语言代码生成器
│   ├── cookie_jar.rs       // Cookie 管理
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── oauth2.rs       // OAuth2 流程处理
│   │   ├── aws_sig.rs      // AWS Signature
│   │   └── digest.rs       // Digest Auth
│   └── models.rs           // 数据模型
└── Cargo.toml
```

### 14.3 核心 API 端点

```
# 合集管理
GET    /api/api-client/collections
POST   /api/api-client/collections
PUT    /api/api-client/collections/:id
DELETE /api/api-client/collections/:id

# 请求管理
GET    /api/api-client/requests/:id
POST   /api/api-client/requests
PUT    /api/api-client/requests/:id
DELETE /api/api-client/requests/:id
POST   /api/api-client/requests/:id/duplicate

# 文件夹管理
POST   /api/api-client/folders
PUT    /api/api-client/folders/:id
DELETE /api/api-client/folders/:id

# 请求执行（代理）
POST   /api/api-client/proxy/rest          // REST 请求代理
POST   /api/api-client/proxy/graphql       // GraphQL 代理
WS     /api/api-client/proxy/ws            // WebSocket 代理
GET    /api/api-client/proxy/sse           // SSE 代理

# 环境管理
GET    /api/api-client/environments
POST   /api/api-client/environments
PUT    /api/api-client/environments/:id
DELETE /api/api-client/environments/:id

# 历史
GET    /api/api-client/history
DELETE /api/api-client/history
DELETE /api/api-client/history/:id

# 导入/导出
POST   /api/api-client/import/openapi      // OpenAPI 导入
POST   /api/api-client/import/postman      // Postman 导入
POST   /api/api-client/import/curl         // cURL 导入
POST   /api/api-client/import/har          // HAR 导入
GET    /api/api-client/export/:collectionId?format=openapi|postman|hopp

# 代码生成
POST   /api/api-client/codegen             // {request, language, library}

# Cookie Jar
GET    /api/api-client/cookies
PUT    /api/api-client/cookies
DELETE /api/api-client/cookies/:domain

# 脚本执行
POST   /api/api-client/script/execute      // 执行脚本（前置/后置）

# OAuth2 回调
GET    /api/api-client/oauth2/callback     // OAuth2 回调端点
```

### 14.4 脚本引擎设计

**方案：Rust 端 JS 沙箱（boa_engine）**

- 前端将脚本 + 上下文（请求/响应/环境变量）发送给后端
- 后端在 `boa_engine` 沙箱中执行脚本
- 注入 `vc` 全局对象（request、response、env、globals、test、expect、utils）
- 脚本执行结果（环境变量变更、测试结果、console 输出）返回前端
- 限制：无文件系统/网络访问，有执行超时控制

**备选方案：前端 Web Worker 沙箱**
- 若 boa_engine 引入的二进制体积过大，可考虑在前端 Web Worker 中执行
- 通过 postMessage 传递上下文和结果

### 14.5 数据存储

使用 ventoos-persist crate 的 SQLite 存储，核心表：

```sql
-- 合集
CREATE TABLE api_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    auth TEXT,           -- JSON: AuthConfig
    headers TEXT,        -- JSON: Header[]
    variables TEXT,      -- JSON: CollectionVariable[]
    pre_request_script TEXT,
    test_script TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 文件夹
CREATE TABLE api_folders (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES api_collections(id) ON DELETE CASCADE,
    parent_folder_id TEXT REFERENCES api_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    auth TEXT,
    headers TEXT,
    variables TEXT,
    pre_request_script TEXT,
    test_script TEXT,
    sort_order INTEGER DEFAULT 0
);

-- 请求
CREATE TABLE api_requests (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES api_collections(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES api_folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    url TEXT NOT NULL DEFAULT '',
    params TEXT,         -- JSON: Param[]
    headers TEXT,        -- JSON: Header[]
    body TEXT,           -- JSON: BodyConfig
    auth TEXT,           -- JSON: AuthConfig
    pre_request_script TEXT,
    test_script TEXT,
    variables TEXT,      -- JSON: RequestVariable[]
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 环境
CREATE TABLE api_environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    variables TEXT NOT NULL, -- JSON: EnvironmentVariable[]
    is_global BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 历史
CREATE TABLE api_history (
    id TEXT PRIMARY KEY,
    request TEXT NOT NULL,   -- JSON: RequestSnapshot
    response TEXT,           -- JSON: ResponseSnapshot
    duration INTEGER,
    starred BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL
);

-- Cookie Jar
CREATE TABLE api_cookies (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    path TEXT DEFAULT '/',
    expires TEXT,
    http_only BOOLEAN DEFAULT FALSE,
    secure BOOLEAN DEFAULT FALSE,
    same_site TEXT
);
```

---

## 15. 请求类型完整列表

| 协议 | 类型 | 优先级 |
|------|------|--------|
| HTTP | REST (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) | P0 |
| HTTP | GraphQL | P0 |
| WebSocket | ws/wss | P1 |
| HTTP | Server-Sent Events (SSE) | P1 |
| HTTP | File Upload (multipart) | P0 |
| HTTP | File Download | P1 |
| gRPC | Unary / Stream | P2（后续迭代） |
| MQTT | Pub/Sub（MQTT over WebSocket） | P1 |
| Socket.IO | 实时通信 | P2（后续迭代） |

---

## 16. 空态与错误态

### 16.1 空态

| 场景 | 显示内容 |
|------|---------|
| 无合集 | 插图 + "创建你的第一个合集" + [新建合集] [导入] 按钮 |
| 无请求 | "在合集中添加第一个请求" |
| 无环境 | "创建一个环境来管理变量" |
| 无历史 | "发送一个请求，历史将显示在这里" |
| 未发送请求 | 请求面板底部：灰色提示 "发送请求以查看响应" |

### 16.2 错误态

| 错误类型 | 显示 |
|----------|------|
| 网络错误 | 红色 Alert："无法连接到 {url}，请检查网络和地址" |
| 超时 | 橙色 Alert："请求超时（{timeout}ms），可在设置中调整" |
| DNS 解析失败 | 红色 Alert："无法解析域名 {host}" |
| SSL 证书错误 | 橙色 Alert + 选项："忽略 SSL 验证并重试" |
| 脚本执行错误 | 脚本标签页底部红色面板，显示错误行号和信息 |

---

## 17. 性能要求

| 场景 | 要求 |
|------|------|
| 冷启动加载 | < 500ms（合集列表） |
| 请求发送 | 代理增加延迟 < 5ms |
| 大型响应（>1MB）渲染 | 使用虚拟滚动，不卡顿 |
| 合集导入（1000+ 请求） | < 3s |
| 脚本执行 | 超时限制 10s |
| 历史记录 | 自动清理 30 天前未标星记录 |
