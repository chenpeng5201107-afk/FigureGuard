# FigureGuard｜科研图表急救室

面向大学生科研与实验场景的数据与图表质检 Web 应用，参赛作品（2026 Qoder 高校创造力大赛 · StudyHack 赛道）。

当前是 **Day 2 版本**，只实现了「CSV 读取与预览」（含边界情况处理）。数据质量检测、异常值分析、图表生成与诊断、修复对比、报告导出尚未开发。

## 现在能做什么

- 选择或拖拽本地 `.csv` 文件，在浏览器本地解析（整块上传区域都接受拖拽，也可以直接点击区域选择文件）
- 点击「体验示例数据」加载内置合成数据集 `public/examples/plant-growth.csv`，解析成功后自动定位到预览区
- 显示真实解析结果：记录数、字段数、数据体积、来源与实际使用的分隔符
- 显示解析发现的格式问题，区分「需要处理」与「说明性提示」，并定位到文件的**物理行号**（引号内的换行也占行）
- 常见边界情况已覆盖：UTF-8 BOM、CRLF 与混用换行符、引号内的逗号与换行、重复表头（按 Papa Parse 的重命名结果读取）、空表头、行长与表头不一致、只有表头、单列 CSV、非 UTF-8/二进制内容
- 空文件、非 `.csv`、超过 5 MB、编码不支持、缺少表头、读取失败都会给出明确的错误提示与建议做法
- 超过 50 行时先显示前 50 行，可按每批 50 行逐批加载（不会一次渲染数万行）
- 空单元格显示为「空值」标签，缺列显示为「—」，两者含义不同且有图例说明
- 数值列右对齐并使用等宽数字，日期与文本列左对齐（只影响排版，单元格文字保持源文件原样）
- 结果对读屏可发现：失败面板是 `role="alert"`，成功结果有常驻的 `aria-live` 播报；系统开启「减少动态效果」时不做平滑滚动

## 技术栈

React 19 · TypeScript 7 · Vite 8 · Tailwind CSS 4 · Papa Parse 5 · Vitest 5

纯前端架构，不使用数据库、登录和外部 API，用户数据不会离开浏览器。Apache ECharts 计划在图表生成阶段引入，当前版本尚未安装。

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 本地开发，默认 http://localhost:5173
npm run build        # 类型检查 + 生产构建，输出到 dist/
npm run preview      # 预览生产构建
npm test             # 运行 Vitest 单元与组件测试（解析跑 node 环境，组件测试用 jsdom）
npm run lint         # 运行 oxlint
```

要求 Node.js 20 或更高版本。

## 目录结构

```
src/
  components/      首页各展示与交互组件
  lib/             CSV 解析与格式化工具（含单元测试）
  types/           数据契约类型定义
  App.tsx          页面组合与状态管理
  *.test.tsx       上传、预览与结果定位的组件测试（jsdom + Testing Library）
public/
  examples/        演示用合成 CSV
docs/
  PRD.md           产品需求与范围
  ARCHITECTURE.md  架构与模块职责
  PROGRESS.md      每日开发记录
  ACCEPTANCE.md    验收清单
```

更详细的说明见 `docs/` 目录，开发约定见 `AGENTS.md`。

## 关于示例数据

`public/examples/plant-growth.csv` 是**合成的植物生长实验记录**，与任何真实实验无关。12 条记录中刻意保留了两处空值和两处可疑数值（如 88.6 cm、-4.2 cm），用于后续质检功能的演示。当前版本只解析和展示，不会识别或标注这些异常。
