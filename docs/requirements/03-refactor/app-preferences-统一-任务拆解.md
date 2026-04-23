# 应用偏好设置统一 - 任务拆解

> 更新时间: 2026-04-22

## 原始需求与拆解表

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1 | 固定一个通用的应用偏好设置弹框，范围在应用窗口内，位置居顶部固定 | 1.1 以现有 `AppPreferences` 为锚点收敛为统一基座<br>1.2 弹框改为应用范围内的 top sheet，而不是居中的通用 modal | 统一偏好设置弹框在应用窗口内渲染，顶部固定，具备关闭和键盘退出能力 | 已完成 |
| 2 | 把应用里现有偏好设置全部替换为统一体系 | 2.1 保留旧 `PreferencesPanel` API 兼容层，避免 monitor/ssh 大改<br>2.2 替换 Explorer 的局部偏好设置实现 | `monitor`、`ssh`、`explorer` 三处偏好设置都使用同一套 UIKit 能力 | 已完成 |
| 3 | 偏好设置不能破坏既有持久化链路 | 3.1 复查 monitor/ssh/explorer 偏好状态持久化位置<br>3.2 保持 `useAppStorage` / store 的现有落库行为 | 刷新后偏好设置值仍可恢复；页面只负责展示与交互 | 已完成 |
| 4 | 如果还有其它可提炼的，也一起收敛 | 4.1 消除 `AppPreferences` / `PreferencesPanel` 双轨实现<br>4.2 抽取旧 API 到新基座的数据适配层 | 仓库内不再存在第二套偏好设置弹框结构继续分叉演化 | 已完成 |
| 5 | 必须补测试并验证构建 | 5.1 为统一偏好设置面板补回归测试<br>5.2 执行前端测试与构建 | 偏好设置回归测试通过，`cd web && pnpm build` 通过 | 已完成 |

## 功能定位 → 影响层级 → 接口设计

| 功能定位 | 影响层级 | 接口设计 |
|---|---|---|
| 应用级偏好设置统一 UIKit | WebOS Shell / Application Layer 共用能力 | 以 `AppPreferencesSheet` 为核心，保留 `PreferencesPanel` 兼容层承接旧 `PreferenceGroup[]` 数据 |

## 实施范围

- `web/src/components/AppPreferences/`：统一偏好设置基座与样式行为
- `web/src/components/PreferencesPanel.tsx`：改为旧 API 兼容层
- `web/src/apps/monitor/index.tsx`：沿用旧数据结构，切换到底层新基座
- `web/src/apps/ssh/index.tsx`：沿用旧数据结构，切换到底层新基座
- `web/src/apps/explorer/index.tsx`：替换局部 `Modal` 偏好面板，接入统一偏好设置体系

## 约束

- 业务偏好值必须继续复用已有 `useAppStorage` / 持久化链路，不新增页面内临时状态作为唯一来源
- 不重写 monitor/ssh 偏好设置数据结构，优先用兼容层平滑替换
- 偏好设置弹框必须是应用窗口内覆盖层，不改成全局系统级窗口