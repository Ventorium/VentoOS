# Phase 1: 基础架构升级 — 任务拆解

> 日期: 2026-04-09

## 目标

将 `web/src/apps/monaco-editor/index.tsx` (1521行单体) 重构为模块化架构，同时完成布局系统、文件图标、主题、标签页增强、状态栏、面包屑等 Phase 1 功能。

## 原始需求与拆解

| 序号 | 原始需求 | 子任务 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1.1 | 代码重构：拆分为模块化架构 + Zustand stores | 创建 types.ts、5个 Zustand store、工具模块、组件拆分 | 所有现有功能保持不变，代码拆分为独立文件 | 已完成 |
| 1.2 | 布局系统 | Activity Bar + Primary Sidebar + Editor Area + Status Bar | 布局与 VS Code 一致，各区域可交互 | 已完成 |
| 1.3 | 文件图标集成 | 文件树 + 标签页 + 命令面板使用 file-icons.ts 的图标 | 不同文件类型显示对应彩色图标 | 已完成 |
| 1.4 | 主题系统 | Light/Dark Monaco 主题 + CSS Variables 联动 | 跟随系统主题切换 vos-dark/vos-light | 已完成 |
| 1.5 | 标签页增强 | 预览模式、拖拽排序、中键关闭 | 单击预览模式(斜体)、双击固定、拖拽换序 | 已完成 |
| 1.6 | 状态栏完整实现 | 左右分区、语言选择器、行列、编码、缩进 | 状态栏在底部全宽显示 | 已完成 |
| 1.7 | 面包屑增强 | 可点击段、最后段高亮 | 面包屑段可点击，hover 显示下划线 | 已完成 |

## 文件规划

```
web/src/apps/monaco-editor/
├── index.tsx                    # 主入口（组装布局）
├── manifest.ts                  # 不变
├── types.ts                     # 类型定义
├── stores/
│   ├── editor-store.ts          # 标签页、编辑器状态
│   ├── workspace-store.ts       # 工作区、文件树、文件索引
│   ├── layout-store.ts          # 布局（侧边栏宽度、活动视图、面板）
│   ├── search-store.ts          # 搜索状态
│   └── ui-store.ts              # 命令面板、上下文菜单、重命名等 UI 临时状态
├── components/
│   ├── ActivityBar.tsx           # 活动栏
│   ├── sidebar/
│   │   ├── FileTree.tsx          # 文件树面板
│   │   ├── FileTreeNode.tsx      # 文件树节点
│   │   ├── FileTreeToolbar.tsx   # 文件树工具栏
│   │   └── SearchPanel.tsx       # 搜索面板
│   ├── editor/
│   │   ├── EditorArea.tsx        # 编辑区域容器（标签栏 + 面包屑 + Monaco）
│   │   ├── EditorTabs.tsx        # 标签栏（含拖拽）
│   │   ├── EditorTab.tsx         # 单个标签
│   │   ├── MonacoWrapper.tsx     # Monaco 编辑器封装
│   │   ├── Breadcrumbs.tsx       # 面包屑导航
│   │   └── WelcomePage.tsx       # 欢迎页（无文件打开时）
│   ├── StatusBar.tsx             # 状态栏
│   ├── CommandPalette.tsx        # 命令面板
│   └── ContextMenu.tsx           # 上下文菜单
└── utils/
    ├── language-detection.ts     # 文件名→语言ID映射
    ├── monaco-themes.ts          # Monaco 主题定义
    └── tree-helpers.ts           # 文件树操作辅助函数
```
