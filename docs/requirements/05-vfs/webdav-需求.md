# WebDAV 支持需求

## 背景

VFS 系统已支持 Local、SFTP、FTP、SMB、S3 五种存储协议，本次补充 WebDAV 协议支持。
同时，Explorer 新增"暴露 WebDAV 服务"功能，允许将已添加的存储源通过 WebDAV 协议对外提供访问。

---

## 一、WebDAV 客户端（消费外部 WebDAV 服务）

### 1.1 功能描述

用户可在 Explorer 的"添加数据源"中选择 **WebDAV** 类型，配置后与其他存储源完全一致的操作体验。

### 1.2 连接 URI 格式

- 推荐：`webdavs://host:port/basePath`
- 仅限本地开发/测试：`webdav://host:port/basePath`

安全约束：

- 默认使用 `webdavs://`，只有在本机开发或临时测试时才允许 `webdav://`
- 用户名和密码不应写入 URI，而应通过独立表单字段或客户端凭据配置提供
- 前端默认提示应优先展示 `webdavs://host:port/basePath`，不得再展示 `user:pass@host` 形式

### 1.3 支持操作

| 操作 | HTTP 方法 | 说明 |
|------|-----------|------|
| 列目录 | PROPFIND (Depth: 1) | 列出目录内容 |
| 读文件 | GET | 读取文件内容 |
| 写文件 | PUT | 写入/上传文件 |
| 创建目录 | MKCOL | 创建目录 |
| 删除 | DELETE | 删除文件或目录 |
| 移动/重命名 | MOVE | 移动文件或目录 |
| 复制 | COPY | 复制文件或目录 |
| 获取元信息 | PROPFIND (Depth: 0) | 获取单个节点信息 |

### 1.4 公开测试服务（测试用例）

以下为可用于功能测试的公开 WebDAV 服务：

| 名称 | 地址 | 认证 | 说明 |
|------|------|------|------|
| Box.com WebDAV | `webdavs://dav.box.com/dav` | 账号密码 | 需注册 Box 账号 |
| Nextcloud 演示 | `webdavs://demo.nextcloud.com/remote.php/dav/files/admin/` | admin/admin | 公开演示实例（可能不稳定） |
| ownCloud 演示 | `webdavs://demo.owncloud.com/remote.php/dav/files/admin/` | admin/admin | 公开演示实例 |
| SabreDAV 测试 | `webdav://demo.sabre.io/` | 无认证 | 仅用于兼容性测试，不作为默认接入示例 |
| CloudMe | `webdavs://webdav.cloudme.com/v1/xdav/{username}/` | 账号密码 | 需注册账号 |

> 建议使用 Nextcloud/ownCloud 的本地 Docker 实例进行完整集成测试。
> 
> 快速启动 Nextcloud 本地测试实例：
> ```bash
> docker run -d -p 8080:80 --name nextcloud nextcloud
> # WebDAV 地址: webdav://localhost:8080/remote.php/dav/files/admin/
> ```
> 认证信息请在客户端单独填写 `admin / admin`，不要拼进 URI。

### 1.5 名称格式限制

存储源名称（`name` 字段）将被用作 WebDAV 服务器的第一级目录路径，因此必须满足：

- 不能为空
- 不能包含 `/`、`\`、`:` 等路径分隔符
- 不能包含 `*`、`?`、`"`、`<`、`>`、`|` 等特殊字符
- 不能以空格开头或结尾
- 最大长度 100 字符
- 建议只使用字母、数字、中文、连字符、下划线和空格

> 添加存储源时前端会实时校验，不合规的名称将提示错误。

---

## 二、WebDAV 服务器（对外暴露存储源）

### 2.1 功能描述

Explorer 右上角（或设置面板）提供 **WebDAV 服务** 设置入口，允许用户：

- 开启/关闭 WebDAV 服务器
- 选择要暴露的存储源（多选，以存储源 `name` 作为第一级目录）
- 设置访问用户名和密码（HTTP Basic Auth）
- 默认建议仅在本机或受信任内网使用；如需跨主机访问，应通过 TLS 终止层或反向代理提供 HTTPS

### 2.2 访问路径结构

WebDAV 服务通过主服务同一端口（5454）提供访问，路径前缀为 `/webdav/`：

```
/webdav/{mount_name}/{file_path...}
```

例如，名为 `我的文档` 的存储源中的文件 `hello.txt` 可通过以下路径访问：

```
http://localhost:5454/webdav/我的文档/hello.txt
```

客户端连接信息：
- **推荐地址**：`https://<your-host>/webdav/`（通过 TLS 终止层或反向代理暴露）
- **本机开发地址**：`http://localhost:5454/webdav/`
- **用户名**：设置的用户名
- **密码**：设置的密码

### 2.3 支持的 WebDAV 方法

| 方法 | 说明 |
|------|------|
| OPTIONS | 返回 DAV 能力声明 |
| PROPFIND | 列目录或获取属性 |
| GET | 下载文件 |
| PUT | 上传/写入文件 |
| MKCOL | 创建目录 |
| DELETE | 删除文件/目录 |
| MOVE | 移动/重命名 |
| COPY | 复制文件/目录 |
| HEAD | 获取文件元信息 |

### 2.4 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vfs/webdav-server/settings` | 获取 WebDAV 服务器配置 |
| PUT | `/api/vfs/webdav-server/settings` | 更新 WebDAV 服务器配置 |

设置结构：

```json
{
  "enabled": true,
  "username": "user",
  "password": "pass",
  "exposed_mounts": ["mount-id-1", "mount-id-2"]
}
```

---

## 三、验收标准

| # | 验收项 | 结果 |
|---|--------|------|
| 1 | 可在页面上通过"添加数据源"添加 WebDAV 源 | - |
| 2 | WebDAV 源支持与其他源相同的操作（列目录、读写、删除、移动等） | - |
| 3 | 存储源名称不符合格式时前端提示错误信息 | - |
| 4 | Explorer 设置面板可开启/关闭 WebDAV 服务 | - |
| 5 | 设置面板可选择要暴露的存储源 | - |
| 6 | 设置面板可配置用户名和密码 | - |
| 7 | 开启后外部 WebDAV 客户端可连接访问 | - |
| 8 | 关闭后 WebDAV 端点返回 404/401 | - |
| 9 | `cargo clippy` + `cargo build` 无错误 | - |
| 10 | `pnpm build` 无错误 | - |
