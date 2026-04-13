---
name: ventoos-icon-creation
description: Use when creating or updating app icons for VentoOS applications, needing to ensure visual consistency with system design standards, or when any new app needs an icon before development begins.
---

# VentoOS 图标创建

## 概述

为 VentoOS 应用创建视觉统一、风格一致的图标。所有图标必须遵循同一套设计语言，确保 Dock 和 Launchpad 中的整体视觉协调。

## 设计标准

### 图标规格
- **尺寸**：40×40px（Dock 标准尺寸），同时提供 3 倍像素导出（120×120px）
- **格式**：优先 SVG（可缩放），如无法满足表现力则使用 PNG（3x 分辨率）
- **圆角**：`border-radius: 22%`（对应 tokens.radius.launchpadIcon = 18）
- **内边距**：图标内容占容器约 55%，四周留 22.5% 边距

### 视觉风格
- **背景**：渐变色（使用 linear-gradient，方向 135deg）
- **图标内容**：白色，使用 Lucide React 图标库中的图标
- **颜色体系**：每个应用使用独特的渐变配色，参考现有应用颜色避免重复

### 现有应用参考色板（避免重复）
| 应用 | 渐变色 |
|------|--------|
| AI 助手 | `#6366f1 → #8b5cf6` |
| 图片编辑器 | `#ec4899 → #8b5cf6` |
| 文件管理器 | `#3b82f6 → #06b6d4` |
| 数据库 | `#16a34a → #0891b2` |
| Redis | `#dc2626 → #ea580c` |
| Kubernetes | `#2563eb → #7c3aed` |
| 终端 | `#1e1e2e → #313244` |
| 设置 | `#6b7280 → #9ca3af` |

## React 内联图标实现（推荐方案）

在 `manifest.ts` 中用 React 内联实现图标：

```tsx
import { IconName } from 'lucide-react'
import React from 'react'
import type { AppManifest } from '@/kernel'

function MyAppIcon() {
  return React.createElement(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #起始色 0%, #结束色 100%)',
        borderRadius: '22%',
        color: '#fff'
      }
    },
    React.createElement(IconName, { size: 22 })
  )
}
```

## PNG 图标方案（SVG 无法满足时）

若需要更丰富的图标表现（如品牌 logo、复杂插图），使用 PNG：
- 导出尺寸：120×120px（3x 分辨率）
- 放置路径：`web/src/apps/<app-id>/icon.png`
- 在 manifest 中引用：

```tsx
import iconUrl from './icon.png'

export const myManifest: AppManifest = {
  // ...
  icon: iconUrl,  // string URL 自动支持
}
```

## 图标选择原则

1. **语义清晰**：图标必须能直觉传达应用的核心功能
2. **Library 优先**：优先从 `lucide-react` 中选择，确保线条粗细一致
3. **颜色差异化**：与相邻应用（字母序）的颜色形成明显区分
4. **对比度**：白色图标在渐变背景上需保证 WCAG AA 对比度

## 流程

```
1. 确定应用核心功能 → 选择 Lucide 图标
2. 选择差异化渐变配色（查上方色板避重）
3. 用 React 内联实现 Icon 组件
4. 在 manifest.ts 中集成
5. 在浏览器中预览 Dock/Launchpad 效果
6. 若 React 图标无法满足视觉需求 → 改用 PNG
```

## 完成后提交

```bash
cd /path/to/VentoOS
git add web/src/apps/<app-id>/manifest.ts
git add web/src/apps/<app-id>/icon.png  # 如果有 PNG
git commit -m "feat(<app-id>): add app icon with design system standards"
git push
```
