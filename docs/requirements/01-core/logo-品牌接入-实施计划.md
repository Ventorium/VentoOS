# Logo 品牌接入 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `assets/Logo.png` 统一接入 VentoOS 前端壳层，并完成顶部栏、锁屏页、关于弹窗、favicon 的品牌化替换与锁屏页视觉升级。

**Architecture:** 在 `web/` 内建立统一品牌资源与品牌展示组件，避免散落引用原始图片。锁屏页在现有 React 组件和全局 CSS 上重构为“深海流带”视觉方案，不改变系统壳层架构和状态流。

**Tech Stack:** React 19、TypeScript 5.9、Vite 8、Vitest、React Testing Library、Framer Motion、CSS Variables

---

## Chunk 1: 文档与资源准备

### Task 1: 品牌接入文档落地

**Files:**
- Create: `docs/requirements/01-core/logo-品牌接入-设计方案.md`
- Create: `docs/requirements/01-core/logo-品牌接入-任务拆解.md`
- Create: `docs/requirements/01-core/logo-品牌接入-完成情况.md`
- Create: `docs/requirements/01-core/logo-品牌接入-验收报告.md`

- [ ] Step 1: 写入设计方案与任务拆解
- [ ] Step 2: 在实现和验证完成后回填完成情况与验收报告

### Task 2: 品牌资源归位

**Files:**
- Create: `web/src/assets/brand/logo.png`
- Create: `web/public/favicon-32x32.png`
- Create: `web/public/favicon-192x192.png`
- Modify: `web/index.html`

- [ ] Step 1: 复制 `assets/Logo.png` 到前端品牌资源目录
- [ ] Step 2: 导出 favicon PNG 资源
- [ ] Step 3: 更新 HTML favicon 引用

## Chunk 2: 测试优先与品牌组件

### Task 3: 为品牌渲染增加失败测试

**Files:**
- Create: `web/src/shell/__tests__/branding.test.tsx`

- [ ] Step 1: 写一个失败测试，验证锁屏页出现品牌 logo 和品牌标题
- [ ] Step 2: 运行 `cd web && pnpm test -- --run web/src/shell/__tests__/branding.test.tsx` 并确认失败
- [ ] Step 3: 补充顶部栏渲染品牌按钮的测试

### Task 4: 品牌展示组件抽离

**Files:**
- Create: `web/src/components/BrandLogo.tsx`
- Modify: `web/src/shell/LoginScreen/index.tsx`
- Modify: `web/src/shell/TopBar/index.tsx`

- [ ] Step 1: 实现可配置尺寸的 `BrandLogo` 组件
- [ ] Step 2: 用统一品牌组件替换顶部栏和锁屏页中的占位图形
- [ ] Step 3: 运行测试并确保转绿

## Chunk 3: 锁屏页视觉重构

### Task 5: 按深海流带方向改造锁屏页

**Files:**
- Modify: `web/src/shell/LoginScreen/index.tsx`
- Modify: `web/src/assets/styles/app.css`

- [ ] Step 1: 重构锁屏页 JSX，拆分主视觉区和解锁面板
- [ ] Step 2: 用多层渐变、流带和辉光重写锁屏页样式
- [ ] Step 3: 增加窄屏场景下的响应式调整
- [ ] Step 4: 重新运行相关测试

### Task 5.1: 锁屏文案减重与液态玻璃微调

**Files:**
- Modify: `web/src/shell/LoginScreen/index.tsx`
- Modify: `web/src/assets/styles/app.css`
- Modify: `web/src/shell/__tests__/branding.test.tsx`

- [x] Step 1: 先补失败测试，要求 unlock 模式移除解释型文案、setup 模式仅保留单句标题
- [x] Step 2: 将锁屏主文案收敛为品牌标题和最少必要占位提示
- [x] Step 3: 将大文字按钮改为轻量图标提交动作，保留错误反馈和可见性切换
- [x] Step 4: 微调玻璃面板高光、输入壳体和流体反射，保留深海流带氛围
- [ ] Step 5: 在具备 Node.js 的环境重跑 `cd web && pnpm test -- --run web/src/shell/__tests__/branding.test.tsx`

### Task 6: 关于弹窗品牌化

**Files:**
- Modify: `web/src/shell/TopBar/index.tsx`

- [ ] Step 1: 将 “关于 VentoOS” 弹窗中的占位 SVG 替换为品牌 Logo
- [ ] Step 2: 保持弹窗信息结构不变，只提升品牌识别度

## Chunk 4: 验证与回填

### Task 7: 完整验证并回填文档

**Files:**
- Modify: `docs/requirements/01-core/logo-品牌接入-完成情况.md`
- Modify: `docs/requirements/01-core/logo-品牌接入-验收报告.md`

- [ ] Step 1: 运行 `cd web && pnpm test`
- [ ] Step 2: 运行 `cd web && pnpm build`
- [ ] Step 3: 将验证结果写入完成情况和验收报告
- [ ] Step 4: 逐项核查原始需求并补齐状态
