# FigureGuard 架构说明

版本：v0.1（Day 1）　　更新日期：2026-11-16

## 1. 技术选型

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 框架 | React 19 | 组件化开发，生态成熟，与 Qoder Sites 静态部署兼容 |
| 语言 | TypeScript 7（严格模式） | 数据结构需要明确契约，避免后续质检逻辑靠猜字段类型 |
| 构建 | Vite 8 | 开发启动快，产物是纯静态文件，可直接部署 |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`） | 无需额外 CSS 框架，浅色设计系统用少量 token 即可 |
| CSV 解析 | Papa Parse 5 | 浏览器端成熟方案，提供真实的错误与告警信息 |
| 测试 | Vitest 5 | 与 Vite 共用配置，直接测试解析模块 |
| 图表 | Apache ECharts（**尚未安装**） | 计划在 F4 图表生成阶段引入 |

架构原则：**纯前端**。没有后端服务、数据库、登录体系和外部 AI API，用户文件内容不离开浏览器内存。

## 2. 目录结构

```
figureguard/
├─ index.html                     应用入口 HTML（标题、语言、描述）
├─ vite.config.ts                 Vite + Tailwind + Vitest 统一配置
├─ tsconfig.app.json              浏览器代码类型检查（排除测试文件）
├─ tsconfig.test.json             测试代码类型检查（允许 Node API）
├─ tsconfig.node.json             vite.config.ts 的类型检查
├─ public/
│  ├─ examples/plant-growth.csv   内置合成示例数据
│  └─ favicon.svg
└─ src/
   ├─ main.tsx                    React 挂载
   ├─ App.tsx                     页面组合 + 解析状态管理 + 结果定位与播报
   ├─ App.test.tsx                结果定位 / 可访问性组件测试（jsdom）
   ├─ index.css                   Tailwind 入口 + 主题色 + 基础排版
   ├─ components/
   │  ├─ AppHeader.tsx            品牌栏（复用 favicon 图形）
   │  ├─ HeroPanel.tsx            核心价值：主标题 + 副标题
   │  ├─ CsvUploadPanel.tsx       主操作入口：整块拖拽区 + 示例/上传按钮 + 解析状态
   │  ├─ CsvUploadPanel.test.tsx  选择 / 拖拽 / 禁用态组件测试（jsdom）
   │  ├─ DataPreview.tsx          统计卡片 + 格式问题列表 + 数据表格
   │  ├─ DataPreview.test.tsx     分批加载与提示列表组件测试（jsdom）
   │  ├─ ProductNotes.tsx         辅助介绍：价值卡片 + 当前版本范围声明
   │  └─ ParseErrorPanel.tsx      解析失败提示（role="alert"）
   ├─ lib/
   │  ├─ csv.ts                   解析核心（无 UI 依赖）：边界处理、问题分级、物理行号换算
   │  ├─ csv.test.ts              解析核心单元测试（含 BOM / 引号 / 表头 / 分隔符边界）
   │  ├─ display.ts               纯排版用的列视觉分类（数值/日期/文本 → 对齐方式）
   │  ├─ display.test.ts          视觉分类单元测试
   │  ├─ format.ts                字节数与计数格式化
   │  └─ format.test.ts           格式化工具单元测试
   └─ types/
      └─ csv.ts                    数据契约类型
```

依赖方向：`components → lib → types`。`lib/csv.ts` 不引用任何 React 组件，便于后续在质检模块中复用，也便于单元测试。`lib/display.ts` 只服务表格排版，不写入 `CsvTable`，与未来的数据类型推断相互独立。

## 3. 数据契约

`src/types/csv.ts` 定义核心结构：

```ts
type CsvCellValue = string | null;   // null 只表示「该行没有这一列」
type CsvSourceKind = 'file' | 'example';
type CsvIssueSeverity = 'error' | 'notice';
type CsvIssueOrigin = 'papaparse' | 'figureguard';

interface CsvTable {
  fileName: string;
  source: CsvSourceKind;
  sizeBytes: number;                 // UTF-8 真实字节数
  columns: string[];
  rows: CsvCellValue[][];            // 顺序与 columns 对齐
  recordCount: number;               // = rows.length
  columnCount: number;               // = columns.length
  delimiter: string;                 // Papa Parse 实际使用的分隔符
  issues: CsvIssue[];
}

interface CsvIssue {
  type: string;                      // Papa Parse 的 error.type，派生提示用派生名
  code: string;                      // TooFewFields / MixedLineEndings / ...
  message: string;                   // 中文说明（界面直接显示）
  rawMessage?: string;               // Papa Parse 英文原文，随提示一并展示
  rowIndex?: number;                 // 数据行下标（不含表头）
  fileLine?: number;                 // 文件物理行号（表头算第 1 行）
  fileEndLine?: number;              // 该记录跨多行时的结束行
  severity: CsvIssueSeverity;        // error = 会读错数据，notice = 只是说明
  origin: CsvIssueOrigin;            // 来自 Papa 还是我们的派生检查
}

type ParseOutcome =
  | { status: 'ok'; table: CsvTable }
  | { status: 'error'; error: CsvError };
```

约定：

- **不做类型推断**，所有单元格保持字符串，空单元格为 `''`；`null` 专指缺列。这样后续的「类型不一致」检测才有真实依据。表格的列对齐只由 `lib/display.ts` 按文本形状判断，结果不写回契约、也不构成任何质量结论。
- `recordCount` / `columnCount` 由解析结果直接计算，界面只读取，不再二次加工。
- `issues` 区分来源与严重级：`origin: 'papaparse'` 保留 Papa 的 `type` / `code` 和英文原文（`rawMessage`），`origin: 'figureguard'` 是我们对同一份解析结果的派生检查（重复表头改名、空列名、混合换行符、非逗号分隔符）。中文说明由 `csv.ts` 的映射表给出，不改动任何单元格数据。
- **行号是文件物理行号**，不能用 `rowIndex + 2` 换算：引号内的换行会让一条记录占多个物理行。`csv.ts` 在确实需要行号时，用同一份 `delimiter` / `linebreak` 再跑一次 `header: false` + `step` 的 Papa 解析，收集每条记录的 `meta.cursor`，配合换行符偏移表（二分查找）与「记录内嵌换行数」得到起止行；只解析到需要的最后一条记录就 `parser.abort()`。干净文件（无错位）不会触发这次额外解析。

## 4. 解析流程

```
用户操作
  ├─ 选择/拖拽文件 → readCsvFile(file)
  │      1. 校验扩展名（非 .csv → not-a-csv，其他表格软件格式给「另存为 CSV UTF-8」提示）
  │      2. 校验大小（> 5 MB → file-too-large）
  │      3. file.text() 读取（失败 → read-failed）
  │      4. parseCsvText(text, source: 'file', sizeBytes: file.size)
  └─ 体验示例数据 → loadExampleCsv()
         1. fetch('/examples/plant-growth.csv')（非 2xx → read-failed；响应体读取失败 → read-failed）
         2. parseCsvText(text, source: 'example', sizeBytes: UTF-8 字节数)

parseCsvText(text)
  1. text.trim() 为空                        → empty-file
  2. 首字符是 U+FFFD 或前 4096 字符含 NUL     → unsupported-encoding
  3. Papa.parse(header:true, skipEmptyLines:'greedy')（抛异常 → parse-failed）
  4. columns = meta.fields（剔除内部键 __parsed_extra）
     rawHeaders = 用 meta.renamedHeaders 反推改名前的首行原文
  5. columns 为空 或 rawHeaders 全为空白       → no-header
  6. data → rows（按 columns 顺序取值，缺列补 null；引号内的换行 / \r 原样保留）
  7. errors + 派生检查 → issues（必要时换算物理行号，见 §3）
  8. 组装 CsvTable（含 meta.delimiter），返回 { status: 'ok', table }
```

注意：

- 「是否真的提供了表头」不能只看 `meta.fields`，也不能靠字符串切分首行：Papa 会把重名列改成 `name_1`、把空列名改成 `_1`。用 `meta.renamedHeaders` 反推原始名字才与真实解析结果一致。
- UTF-8 BOM 由 Papa 自行剥离，因此首列名不会带 BOM；字节数按含 BOM 的原始文本计算（`TextEncoder`）。
- LF 与 CRLF 混用时，Papa 按首个换行符切分，行末的 `\r` 会留在最后一个单元格里。数据保持原样，改为追加一条 `error` 级派生提示（`MixedLineEndings`）说明这一点。

## 5. 状态管理

Day 1 只有一个共享状态，因此使用 `App.tsx` 内的 `useState`，不引入状态库：

```ts
const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
const [isParsing, setIsParsing] = useState(false);
const [resultToken, setResultToken] = useState(0);   // 每完成一次解析 +1
```

渲染分支：解析中 → 上传区显示「正在解析」；`ok` → `<DataPreview>`；`error` → `<ParseErrorPanel>`；`null` → 只显示首页与上传区。

结果定位由 `resultToken` 驱动（`commitOutcome` 同时写 outcome 与递增 token）：一次解析只滚一次，重复渲染不会反复滚动；面板顶部已落在视口上半部（`0 ≤ top ≤ innerHeight * 0.5`）时直接跳过。平滑滚动与否取自 `matchMedia('(prefers-reduced-motion: reduce)')`。成功结论同时写进常驻的 `sr-only role="status" aria-live="polite"` 文案，失败结论由 `ParseErrorPanel` 的 `role="alert"` 播报。

`DataPreview` 内部用局部 state 控制「再显示 N 行」的分批计数，并在 `table` 引用变化时回到首批。

## 6. 构建与测试配置

- `vite.config.ts` 同时被 Vite 和 Vitest 使用：默认 `environment: 'node'`，`include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`；需要 DOM 的组件测试在文件首行写 `// @vitest-environment jsdom` 单独切换环境，纯解析用例仍跑在 node 环境
- 组件交互测试用 `@testing-library/react` + `@testing-library/dom`（devDependency），断言只用 DOM 结构与文本（未引入 jest-dom 匹配器）；`scrollIntoView` / `getBoundingClientRect` / `matchMedia` 在测试里替换，浏览器端 `fetch` 与 `File.text()` 用 `vi.stubGlobal` / stub 文件对象模拟
- `tsc -b` 通过三个 project 分别检查浏览器代码、测试代码、构建脚本；测试文件（含 `.test.tsx`）不参与生产打包（Vite 只按 `main.tsx` 的 import 图打包）
- 生产产物：`dist/`（`index.html` + `assets/*` + `examples/plant-growth.csv`），是纯静态资源，满足 Qoder Sites 部署条件
- 路由：当前是单页首页，没有引入路由库；若后续增加多页面再考虑

## 7. 为后续功能预留的扩展点

| 计划功能 | 接入方式 |
| --- | --- |
| F2 数据质量检测 | 新增 `src/lib/quality.ts`，输入 `CsvTable`，输出问题列表；不修改解析层 |
| F3 异常值分析 | 新增 `src/lib/outlier.ts`，需要先在解析层引入列类型推断（数值/日期/分类） |
| F4 图表生成 | 安装 `echarts`，新增 `src/lib/chart-spec.ts` 生成配置，组件只负责渲染 |
| F5/F6 图表诊断与对比 | 诊断规则与 ECharts option 分离，便于做「修复前/修复后」两个 option 对比 |
| F7 报告导出 | 汇总各模块结构化结果后在前端生成文件，不依赖后端 |

扩展约束：任何统计结论都必须能追溯到 `CsvTable` 的具体行列，禁止写死示例数据或返回固定分数。
