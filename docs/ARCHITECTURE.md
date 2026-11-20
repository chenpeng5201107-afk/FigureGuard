# FigureGuard 架构说明

版本：v1.0（正文已覆盖 Day 1～Day 9 与最终收尾；本文件按模块职责而非日期组织，Day 5～Day 9 的图表、诊断、修复与导出层见第 2、4、6、9 节）　　更新日期：2026-11-20

## 1. 技术选型

| 层 | 选择 | 原因 |
| --- | --- | --- |
| 框架 | React 19 | 组件化开发，生态成熟，与 Qoder Sites 静态部署兼容 |
| 语言 | TypeScript 7（严格模式） | 数据结构需要明确契约，避免后续质检逻辑靠猜字段类型 |
| 构建 | Vite 8 | 开发启动快，产物是纯静态文件，可直接部署 |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite`） | 无需额外 CSS 框架，浅色设计系统用少量 token 即可 |
| CSV 解析 | Papa Parse 5 | 浏览器端成熟方案，提供真实的错误与告警信息 |
| 测试 | Vitest 5 | 与 Vite 共用配置，直接测试解析模块 |
| 图表 | Apache ECharts 5.6（按需引入 `echarts/core` + Bar/Line/Scatter + Grid/Tooltip + CanvasRenderer） | Day 5 F4 V1 引入柱状/散点，Day 6 增注册 `LineChart` 支持时间序列；只用官方模块化 API，不叠加 React 图表封装库 |

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
│  ├─ examples/plant-growth.csv   内置合成示例数据（12 行 × 4 列，含 2 处空值与 88.6 / -4.2 两个可疑数值）
│  ├─ examples/baseline-demo.csv  内置合成演示数据（A=96 / B=98 / C=97，专门演示零基线风险与一键修复闭环）
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
   │  ├─ DataPreview.tsx          统计卡片 + 格式问题列表 + 数据质量概览 + 数据表格
   │  ├─ DataPreview.test.tsx     分批加载、提示列表与质量概览集成的组件测试（jsdom）
   │  ├─ DataQualityPanel.tsx     数据质量概览：准入说明卡 / 四项统计 + 问题列表（逐批展开）
   │  ├─ DataQualityPanel.test.tsx 统计文案、逐批展开、阻止态与换文件重置（jsdom）
   │  ├─ ChartLab.tsx             图表实验室：图表类型 / X-Y 字段选择、标题与轴标题与单位配置区、聚合方式、柱状图 Y 轴起点配置（自动 / 手动）、参与与排除统计、空状态与上限提示、「图表表达检查」面板（含一键修复入口与不可修复原因）、修复记录的渲染期失效与撤销、把当次渲染的 option 与诊断结果交给导出层（Day 9）
   │  ├─ ChartLab.test.tsx        类型切换、默认选择、换文件重置、准入阻止与实例清理 + Day 6 配置 / 聚合 / 折线图 + Day 7 Y 轴起点联动与非零基线诊断 + Day 8 修复资格 / 前后对比 / 撤销 + Day 9 导出可用性 / 离屏生命周期 / 三种图型 option 一致 / 下载名与回显（jsdom，mock ECharts 并记录每个实例容器）
   │  ├─ ChartRepairPanel.tsx     修复完成态 + 前后两张真实 ECharts 并排对比 + 「本次修复修改了什么？」差异表 + 单步撤销按钮与边界说明
   │  ├─ ChartExportPanel.tsx     「导出分析成果」区：两个导出按钮的可用性回显、导出对象说明、成功与失败的中文反馈、同一帧内重复点击的 ref 兜底（组件内不做任何统计与判定）
   │  ├─ EChartCanvas.tsx         可复用 ECharts 容器：初始化 / setOption / resize / dispose 生命周期与无障碍说明
   │  ├─ ProductNotes.tsx         辅助介绍：价值卡片 + 当前版本范围声明
   │  └─ ParseErrorPanel.tsx      解析失败提示（role="alert"）
   ├─ lib/
   │  ├─ csv.ts                   解析核心（无 UI 依赖）：边界处理、问题分级、物理行号换算
   │  ├─ csv.test.ts              解析核心单元测试（含 BOM / 引号 / 表头 / 分隔符边界）
   │  ├─ dataQuality.ts           质量诊断核心（无 UI 依赖）：准入判断、缺失值统计、重复检测、字段类型分析、问题列表
   │  ├─ dataQuality.test.ts      诊断单元测试（含 12,000 行重复检查与原始数据不变性）
   │  ├─ columnTypes.ts           字段类型推断核心（无 UI 依赖）：单元格投票、类型冲突检测、标识符识别
   │  ├─ columnTypes.test.ts      字段类型推断单元测试（34 个场景）
   │  ├─ echartsCore.ts           ECharts 按需注册（Bar/Line/Scatter + Grid/Tooltip/Title + CanvasRenderer），集中 `echarts.use`（Day 9 加 `TitleComponent`，让导出 PNG 能把标题画进画布）
   │  ├─ chartData.ts             图表数据适配核心（无 UI 依赖）：字段资格、逐格数值校验、缺失/类型/日期排除计数、类别聚合（平均/求和）、时间序列解析与排序、上限截断、option 生成与注入转义、口径说明文本
   │  ├─ chartData.test.ts        图表数据适配单元测试（108 个用例：柱状/散点/折线、逐条与聚合口径、时间解析与排除、上限、不可变性与转义、纵轴起点 `yMin` 透传与无效配置整体省略 `min` 键、轴名 `nameGap` 不压刻度）
   │  ├─ chartConfig.ts           图表配置核心（无 UI 依赖）：默认标题生成、轴标题与单位拼装、文本清洗与长度上限、`resolveYAxisStart()` 纵轴起点解析（单一可信来源）、配置快照、差异比较、上下文变更后的标题保留与提示
   │  ├─ chartConfig.test.ts      图表配置单元测试（62 个用例，含 `resolveYAxisStart()` 的自动 / 手动 / 无效 / 全部裁掉 / 部分裁剪 / 起点等于最小值 notice / NaN 分支）
   │  ├─ chartDiagnostics.ts      图表表达诊断规则核心（无 UI / 无 ECharts 依赖）：依据真实纵轴配置判断普通柱状图非零基线表达风险，产出可解释的结构化诊断；裁剪本身由 `resolveYAxisStart()` 在配置层拦截，本模块只如实转述、不另立规则
   │  ├─ chartDiagnostics.test.ts 诊断规则单元测试（28 个用例：风险识别 + 图表类型边界 + 部分裁剪保护经真实 `resolveYAxisStart()` 链路的判定）
   │  ├─ chartRepair.ts           零基线修复规则核心（无 UI / 无 ECharts 依赖）：`evaluateRepairEligibility()` 六道门（读生效下界而非输入框文本）、`createRepairRecord()` 钉存前后配置快照 + 同一份 `ChartDataResult` 生成的前后两份真实 option、`describeRepairStaleness()` 失效边界、`evaluateRepairUndo()` 撤销安全复核、`describeRepairChanges()` 差异说明
   │  ├─ chartRepair.test.ts      修复规则单元测试（38 个用例：资格六门 / 只改 `yAxisStart` / 前后快照与 option / 失效边界 / 撤销拒绝 / 同名重载与聚合与上限边界 / 差异文案）
   │  ├─ fileDownload.ts          本地下载核心（无 UI 依赖）：`saveFile()` 的 Blob + Object URL 与延迟回收、`buildExportFileName()` 的来源文件名安全化（路径 / 控制字符 / Windows 保留名 / 码点截断）
   │  ├─ fileDownload.test.ts     下载与文件名安全单元测试（18 个用例）
   │  ├─ chartPngExport.ts        PNG 导出核心：`buildPngExportOption()` 只加表达配置（关动画、白底、标题进画布、按标题长度抬高 `grid.top`），`exportChartPng()` 负责离屏容器真实尺寸、`setOption`→`flush`→等帧（后台页跳过）→`getDataURL`→PNG 校验→落盘，成功失败都 `dispose` 并移除临时 DOM
   │  ├─ chartPngExport.test.ts   离屏生命周期单元测试（24 个用例：option 逐字透传、白底与像素比、flush 与取图顺序、无效数据与异常兜底、后台页不挂起、实例与 DOM 不泄漏）
   │  ├─ reportExport.ts         Markdown 报告装配核心（无 UI / 无 ECharts 依赖）：七段式正文、准入被阻止时的「非正式结论」声明、按诊断状态分支的风险段、仅在有有效修复记录时出现的修复段、Markdown 表格与行内标记转义
   │  ├─ reportExport.test.ts     报告装配单元测试（35 个用例：七段齐全、数字全部来自传入结果、禁止示例值、均值样本数、求和口径、折线时间规则、未填单位不自动补、自动范围不写成下界恰好 0、修复段、准入被阻止时的非正式结论、转义与文件名）
   │  ├─ chartExport.ts           导出面板决策层（纯函数）：`evaluateChartExport()` 按钮可用性与中文原因、`describeExportTarget()` 导出对象说明、`buildPngRequest()` / `buildReportFile()` 装配、`runPngExport()` / `runReportExport()` 两个入口、`buildReportChartContext()` 把当次渲染结果收敛成报告上下文
   │  ├─ chartExport.test.ts      决策层单元测试（22 个用例：四种可用性状态、说明文字与屏幕口径、离屏 option 透传、报告上下文有无选定字段、准入被阻止时 PNG 禁用而报告仍可导出、失败兜底与错误文案）
   │  ├─ display.ts               纯排版用的列视觉分类（数值/日期/文本 → 对齐方式）
   │  ├─ display.test.ts          视觉分类单元测试
   │  ├─ format.ts                字节数、计数与比率格式化
   │  └─ format.test.ts           格式化工具单元测试
   └─ types/
      ├─ csv.ts                    解析层数据契约
      ├─ dataQuality.ts            质量诊断数据契约（准入、逐列统计、重复组、问题条目、报告）
      └─ chart.ts                  图表层数据契约（图表类型、类别聚合口径、轴配置、纵轴起点配置与图表配置）
```

依赖方向：`components → lib → types`。`lib/csv.ts` 与 `lib/dataQuality.ts` 都不引用任何 React 组件：质检只消费 `CsvTable`，便于单测也保证解析层不被反向依赖。`lib/display.ts` 只服务表格排版，不写入 `CsvTable`，与未来的数据类型推断相互独立。`lib/format.ts` 是三个模块共用的展示层工具（`formatBytes` / `formatCount` / `formatRate`），不含业务判断。`lib/chartConfig.ts` 与 `lib/chartData.ts` 同样不引用 React：前者只管「怎么标注、纵轴起点解析成什么」，后者只管「哪些数据参与计算、option 怎么生成」，`ChartLab.tsx` 只负责把两者的结果拼成界面，因此配置改动不会影响任何统计数字，统计口径也不依赖界面状态。`lib/chartDiagnostics.ts` 是规则层，夹在两者之上：它只读 `resolveYAxisStart()` 解析后的轴配置与 `ChartDataResult.yRange`，既不碰 React，也不碰 ECharts，更不回写任何数据——「输入框的值 → ECharts 实际下发的 `yAxis.min` → 诊断依据」三者共用同一个 `appliedMin`，保证报告的风险与屏幕上画出的图一致。Day 9 的导出层沿用同一条依赖方向：`lib/chartExport.ts` 是纯决策层（不引用 React，`ChartExportPanel.tsx` 只渲染它算好的可用性与文案），`lib/reportExport.ts` 只把已经算好的结果排成文本，`lib/fileDownload.ts` 只管 Blob→Object URL→`<a download>` 与文件名安全化，三者都不回写 `CsvTable`；只有 `lib/chartPngExport.ts` 会直接驱动 ECharts 生命周期，而且它拿的是页面当前那份 option 引用，因此「导出的图」与「屏幕上的图」不可能来自两套计算。

## 3. 数据契约

`src/types/csv.ts` 定义核心结构：

```ts
type CsvCellValue = string | null;   // null 只表示「该行没有这一列」
type CsvSourceKind = 'file' | 'example';
type CsvIssueSeverity = 'error' | 'notice';
type CsvIssueOrigin = 'papaparse' | 'figureguard';
type CsvStructureState = 'sound' | 'degraded';

interface CsvTable {
  fileName: string;
  source: CsvSourceKind;
  sizeBytes: number;                 // UTF-8 真实字节数
  delimiter: string;                 // Papa Parse 实际使用的分隔符
  columns: string[];
  rows: CsvCellValue[][];            // 顺序与 columns 对齐
  recordCount: number;               // = rows.length
  columnCount: number;               // = columns.length
  issues: CsvIssue[];                // 逐条明细，每种来源有上限（MAX_ITEMIZED_ISSUES = 200）
  issueTotals: { errors: number; notices: number };   // 不受明细上限影响的真实条数
  issueGroups: CsvIssueGroup[];      // 按类型聚合：total 全量、itemized 已逐条列出数
  structure: CsvStructureStatus;     // 行列是否跟得上表头
}

interface CsvIssue {
  type: string;                      // Papa Parse 的 error.type，派生提示用派生名
  code: string;                      // TooFewFields / MixedLineEndings / ...
  label: string;                     // 简短中文类别名（问题类型分布用）
  message: string;                   // 中文说明（界面直接显示）
  rawMessage?: string;               // Papa Parse 英文原文，随提示一并展示
  rowIndex?: number;                 // 数据行下标（不含表头）
  fileLine?: number;                 // 文件物理行号（表头算第 1 行）
  fileEndLine?: number;              // 该记录跨多行时的结束行
  severity: CsvIssueSeverity;        // error = 会读错数据，notice = 只是说明
  origin: CsvIssueOrigin;            // 来自 Papa 还是我们的派生检查
}

interface CsvStructureStatus {
  state: CsvStructureState;
  rowsWithMissingFields: number;     // 字段数少于表头的记录数（这些行有 null）
  rowsWithExtraFields: number;       // 字段数多于表头的记录数
  droppedExtraValues: number;        // 没有列名接收、没进表格的值个数
  renamedHeaderColumns: number;      // 只改列名不丢数据（重名 / 空列名）
  mixedLineEndings: boolean;         // LF 与 CRLF 混用
  reasons: string[];                 // 中文原因，degraded 时非空
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

### 3.1 质量诊断契约（`src/types/dataQuality.ts`）

诊断层是 `CsvTable` 的**只读消费者**：它新建自己的结构，不回填、不排序、不替换任何单元格（有回归用例用引用相等 + JSON 快照钉住）。

```ts
type QualityBlockerCode = 'structure-degraded' | 'parse-errors';

interface QualityBlocker {              // 为什么现在不能出正式结论
  code: QualityBlockerCode;
  message: string;                      // 中文说明，界面直接显示
  evidence: string[];                   // 来自 structure.reasons / issueGroups 的真实数量
}

interface QualityAdmission {
  allowed: boolean;                     // blockers 为空才允许分析
  blockers: QualityBlocker[];
  structureState: CsvStructureState;
  parseErrorCount: number;              // = table.issueTotals.errors（全量真实值）
  noticeCount: number;                  // 说明性提示，不阻止分析
}

interface ColumnMissingStats {          // 逐列四类计数 + 三个比率
  index: number; column: string; label: string;
  emptyCount: number;                   // '' = 内容缺失
  blankCount: number;                   // 只有空白字符 = 疑似空白值（不并入缺失）
  structuralGapCount: number;           // null = 该行没读到这一列（与空单元格不同口径）
  presentCount: number;                 // = recordCount - 上面三者
  emptyRate: number; blankRate: number; qualityGapRate: number;
}

interface MissingValueSummary {
  recordCount: number; columnCount: number; cellCount: number;
  totalEmptyCells: number; totalBlankCells: number; totalStructuralGaps: number;
  columnsWithEmpty: number; columnsWithQualityGap: number;
  overallEmptyRate: number;
  columns: ColumnMissingStats[];
  focusColumns: ColumnMissingStats[];   // 有缺口的列，按 qualityGapRate → emptyCount → 列序排序
}

interface DuplicateRecordGroup { firstRowIndex: number; occurrenceCount: number; rowIndexes: number[]; }

interface DuplicateSummary {            // 三个数量分开，避免「5 行重复」与「3 组重复」混淆
  recordCount: number;
  duplicateGroupCount: number;          // 重复组数（全量）
  recordsInDuplicateGroups: number;     // 涉及重复的记录数
  extraCopyCount: number;               // 额外副本数 = 涉及数 - 组数
  duplicateRate: number;
  groups: DuplicateRecordGroup[];       // 明细上限 MAX_ITEMIZED_DUPLICATE_GROUPS = 200
  groupsTruncated: boolean;
}

type DataQualityFindingKind = 'no-records' | 'column-quality' | 'duplicate-rows';

interface DataQualityFinding {          // 给学生看的条目，全部由统计结果生成
  id: string;
  kind: DataQualityFindingKind;
  severity: 'attention' | 'info';       // 建议确认 / 仅说明（阈值 ATTENTION_QUALITY_GAP_RATE = 0.1）
  title: string;
  detail: string;                       // 含真实数量、数据行序号与「没有删除或改写任何行」
}

interface DataQualityReport {
  fileName: string; recordCount: number; columnCount: number;
  missing: MissingValueSummary;
  duplicates: DuplicateSummary;
  findings: DataQualityFinding[];       // 一次最多 MAX_ITEMIZED_QUALITY_FINDINGS = 100 条
  itemizedFindingTotals: { attention: number; info: number };   // 对「返回列表」计数，不是全量
  findingsTruncated: boolean;
}
```

命名约定：`itemized*` / `*Truncated` 一律表示「逐条列出的部分」，全量数字只出现在 `issueTotals`、`issueGroups[].total`、`duplicateGroupCount`、`totalEmptyCells` 这些字段上。界面文案必须区分两者，不能把明细长度说成总量。

### 3.2 图表层契约（`src/types/chart.ts` + `src/types/dataQuality.ts` 的列类型）

```ts
type ChartKind = 'bar' | 'scatter' | 'line';                 // Day 5 柱状/散点，Day 6 折线
type CategoryAggregation = 'raw' | 'mean' | 'sum';           // 只有柱状图可为 mean / sum，其余恒为 raw

interface ChartAxisConfig { title: string; titleEdited: boolean; unit: string }
interface YAxisStartConfig { mode: 'auto' | 'manual'; raw: string }  // Day 7：raw 是输入原文，未校验
interface ChartConfig { title: string; titleEdited: boolean; xAxis: ChartAxisConfig; yAxis: ChartAxisConfig; yAxisStart: YAxisStartConfig }
```

`titleEdited` 是整个配置层的支点：`false` 时标题跟随「图表类型 + 字段名 + 聚合口径」自动重算，`true` 时用户手写的标题在任何类型切换、字段更换、换文件之后都不会被无提示覆盖，只有在确实发生覆盖风险时由 `reconcileConfigForContext()` 生成一条说明（`title-manual` / `title-fallback` / `axis-field-reset` / `aggregation-dropped`）。单位字段同理：`unit` 只作为标注文本拼进轴标题（`株高（cm）`），系统不读它、不用它做任何换算，也不猜测单位；留空时界面显式写出「未填写单位（单位需要你自己确认，系统不会猜测或换算）」。

配置文本一律先清洗再展示：控制字符与不可见字符替换为空格、首尾空白裁掉、长度分别限 120 / 60 / 24（`MAX_TITLE_LENGTH` / `MAX_AXIS_TITLE_LENGTH` / `MAX_UNIT_LENGTH`）。清洗是「按未填写处理」而不是报错丢弃，因此粘贴进去的富文本不会让界面崩，也不会把 `<script>` 之类内容当成 HTML 注入——展示走 React 文本节点，tooltip 片段仍统一 `escapeHtml`。

`ChartConfigSnapshot` 与 `diffChartConfig(before, after)` 只比较配置本身，不记录历史。Day 7 起，Y 轴零基线判定不再是「预留」而是已落地：`resolveYAxisStart(config.yAxisStart, yRange)` 把 auto / manual 的输入解析成一个 `appliedMin`（单一可信来源），同一个值同时喂给三处——ECharts 柱状图 `yAxis.min`、界面上的「当前纵轴起点」回声、以及 `diagnoseBaseline()` 的诊断依据。规则层 `src/lib/chartDiagnostics.ts` 只读这个 `appliedMin` 与 `ChartDataResult.yRange`，产出结构化 `BaselineDiagnostic`（`ruleId` / `chartKind` / `status` / `level` / `title` / `currentConfig` / `basis` / `visualImpact` / `suggestion` / `configSource`），不回写任何数据。判定保守：只有「柱状图 + 有限 `yRange` + `appliedMin` 是有限正数」才报风险；散点 / 折线判「不适用」，起点无效、或高于数据最小值因而会把有效数值部分裁到轴外判「配置无效」并退回自动范围，起点恰好等于数据最小值时仍应用但由 `resolveYAxisStart().notice` 如实提示「等于最小值的柱子会退化为零长度，不能算已经完整可辨」，绝不把「不适用」或「被裁掉的配置」当成「已通过」，也不凭输入框里的数字单独报风险。措辞统一为「可能夸大数值差异 / 建议核查纵轴起点 / 通常建议包含零基线」，不出现「造假 / 数据错误 / 证明具有误导性」。`configSource = 'chartConfig.yAxisStart'` 让每条诊断都能追溯到具体配置字段，Day 8 的「一键修复 → 前后对比 → 撤销」正是挂在这个字段上：修复动作把 `config.yAxisStart` 换成 `{ mode: 'auto', raw: '' }` 后重新走同一条 `resolveYAxisStart()` → `toEChartsOption()` → `diagnoseBaseline()` 链路，因此「恢复零基线」不等于把下界写死成 0，也不存在第二套修复用的计算口径。

## 4. 解析流程

```
用户操作
  ├─ 选择/拖拽文件 → readCsvFile(file)
  │      1. 校验扩展名（非 .csv → not-a-csv，其他表格软件格式给「另存为 CSV UTF-8」提示）
  │      2. 校验大小（> 5 MB → file-too-large）
  │      3. file.text() 读取（失败 → read-failed）
  │      4. parseCsvText(text, source: 'file', sizeBytes: file.size)
  └─ 示例数据按钮 → loadExampleCsv(key)（key: 'plant' | 'baseline'，默认 'plant'）
         1. fetch('examples/plant-growth.csv' | 'examples/baseline-demo.csv')（非 2xx → read-failed；响应体读取失败 → read-failed）
         2. parseCsvText(text, source: 'example', sizeBytes: UTF-8 字节数)，来源名取各自的 CSV 文件名

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

## 5. 数据质量诊断流程（Day 3）

```
<DataPreview table>
  └─ <DataQualityPanel table>
        1. evaluateQualityAdmission(table)          // 纯函数，无副作用
        ├─ !allowed → 只渲染琥珀色说明卡（blockers + evidence + 口径），
        │              连统计都不做：不把读错位的单元格包装成正式质量结论
        └─ allowed  → analyzeDataQuality(table)
                       ├─ summarizeMissingValues(table)   // 逐格三类计数 + 比率
                       ├─ findDuplicateRecords(table)     // 单趟 Map，整行 JSON 作键
                       └─ buildQualityFindings(...)       // 统计结果 → 问题条目（有上限）
```

准入为什么是两个独立信号：`structure.state` 只回答「行列跟不跟得上表头」，而 `a` + `"foo`（`MissingQuotes`）让后面的内容整体错位时字段数依然匹配，`state` 仍是 `sound`。所以 `evaluateQualityAdmission()` 同时检查 `state !== 'sound'` 与 `issueTotals.errors > 0`，任一成立就阻止正式结论；`notice` 级说明（单列文件、重名表头改名）不阻止。阻止时**不削减浏览能力**：原始表格、`issueGroups` 概览、逐条解析告警与结构横幅照常渲染，只是把结论换成「为什么现在不能分析 + 怎么修」。任何 `error` 都不会被静默忽略——它要么出现在告警明细里，要么成为准入说明的 evidence。

统计口径：`''` 计入缺失、`null` 计入结构性缺列、只有空白字符的单元格单列为疑似空白值、`'0'` 与任何非空文本都是实际内容。所有比率走同一个 `ratioOf(numerator, denominator)`：分母非正返回 0，`recordCount === 0`（只有表头）时不产生 `NaN` / `Infinity`。逐列四类计数之和恒等于 `recordCount × columnCount`，作为守恒式由测试守住。

重复检测复杂度 O(n)：`Map<string, number | number[]>`，键是 `JSON.stringify(row)`（`null` 与 `''` 天然不同字符串，单元格里的逗号/引号/换行都被转义，无需自定义分隔符）。首次出现只存下标，重复了才升级为数组，干净文件不会为每行额外分配数组。判定是整行逐字段严格相等，因此 `sample_id` 不同而测量值相同的两行不会被判为重复；不删除、不去重。

三层明细上限，全部「限量渲染、全量计数」：解析错误明细 200（`MAX_ITEMIZED_ISSUES`）、重复组明细 200（`MAX_ITEMIZED_DUPLICATE_GROUPS`）、一次生成问题 100（`MAX_ITEMIZED_QUALITY_FINDINGS`）；界面在此之上再按每批 5 条展开（首屏 5 条）。`buildQualityFindings()` 给「另有 N 组重复记录没有逐条列出」这条折叠说明**预留一格**（`capacity = 上限 - 说明条数`），否则上限之外恰好会把说明本身挤掉，变成静默丢弃。

## 6. 图表层流程（Day 5 引入，Day 6 扩展聚合与时间序列，Day 7 扩展纵轴起点与表达诊断，Day 8 扩展修复闭环，Day 9 扩展成果导出）

`computeChartData(table, kind, xIndex, yIndex, aggregation)` 一次产出「数据点 + 参与/排除统计 + 口径说明」，全程只读 `CsvTable.rows`，不改写、不删除、不补齐任何单元格。三段职责互不重叠：

1. **字段资格**（`evaluateFieldAvailability` / `fieldChoicesForAxis` / `dateFieldChoices`）：柱状图 X 轴接受类别列，Y 轴接受数值列；散点图两轴都要数值且不能同列；折线图 X 轴只接受被 `columnTypes.ts` 判为日期的列。类型冲突候选列仍可绘制，但会在说明里点明排除口径。
2. **逐格准入**：Y 数值走同一套 `evaluateNumericCell`，`''` / 纯空白 / 结构性缺列计入缺失，非数值文本与 `1e999` 计入无效，`0`、负数、合法小数一律照常参与。折线图另加日期准入：`parseDateParts` 只认「年在前的 `YYYY-M-D` / `YYYY/M/D`，可带 `HH:mm[:ss]`」，用 `Date.UTC` 组装，`isCalendarValidDate` 拒绝 `2026-02-30` 这类日历上不存在的写法；只到年月（`2026-01`）的值计入「精度不足」，明确报告而不补成某月第一天；完全不按日期写法解释的文本计入「不是支持的日期写法」。整个模块不调用 `Date.parse()`，不读浏览器时区。
3. **成图**：`toEChartsOption(result, { xLabel, yLabel, xName?, yName? })` 分别产出柱状 / 散点 / 折线 option。轴名 `xName` / `yName` 是「轴标题 + 单位」的画布文本（横向截到 18 字符、纵向 22 字符），而 tooltip 的键仍用字段原名，避免用户填写的标注被误当成字段本身；完整文本由 DOM 里的 `title` 属性与 `sr-only` 说明给出，画布截断不等于信息丢失。
4. **纵轴起点与表达诊断（Day 7，仅柱状图）**：`resolveYAxisStart(config.yAxisStart, result.yRange)` 把「自动 / 手动」的输入解析成唯一的 `appliedMin`（auto→`null`；manual 必须是有限数值、`trim()` 后非空、经正则校验），并在存在有效 `yRange` 时做三段范围保护：`>= yRange.max` 会把全部数值裁到轴外、`> yRange.min` 会把低于起点的有效数值**部分**裁到轴下看不见，两者都拒绝应用（`error` 逐字点名被隐藏的区间与数据最小值、`appliedMin` 退回 `null`、绘图与诊断一起回到自动范围）；`=== yRange.min` 照常应用但附带 `notice`，如实说明「等于最小值的那些柱子会退化成长度 0，只剩坐标轴上的一个位置，不能算已经完整可辨」。同一个 `appliedMin` 三处共用：作为 `yMin` 透传进 `toEChartsOption` 的柱状图 `yAxis.min`（`scale` 仍为 `false`；无效时整个 `min` 键缺席，配合 `setOption(option, true)` 的 notMerge 不会沿用旧下界）、界面上的「当前纵轴起点」回声（`notice` 另以 `yaxis-start-notice` 琥珀色提示呈现）、以及 `diagnoseBaseline({ kind, yRange, axisStart, yFieldLabel })` 的判定依据。规则层 `src/lib/chartDiagnostics.ts` 是独立纯模块（不引用 React 或 ECharts）：只有「柱状图 + 有限 `yRange` + `appliedMin` 是有限正数」才判风险，散点 / 折线判「不适用」、无效或被裁配置判「配置无效」（`summary` 直接转述 `resolveYAxisStart().error`，不另立第二套裁剪规则）、无数据判「无数据」，绝不把「不适用」或「被拦下的起点」显示成「已通过」。诊断只读不算、不回写 `CsvTable`，也不会因输入框里的数字单独报风险——一切以真正下发给图表的 `appliedMin` 为准。

5. **一键修复与单步撤销（Day 8，仅柱状图零基线这一条规则）**：`src/lib/chartRepair.ts` 是修复规则层，同样不引用 React 与 ECharts。`evaluateRepairEligibility(source)` 用六道门决定「有没有修复可做」——`kind === 'bar'`、`admissionAllowed`、`result.validCount > 0`、`diagnostic.status === 'risk'`、`diagnostic.ruleId === 'bar-zero-baseline'`、`diagnostic.axisStart.appliedMin` 是有限正数；最后一条刻意只读诊断里**真正生效**的下界，绝不看输入框文本，所以「填了 95 但被第 4 步的保护拦下」与「数据本来就含 0」都不会给出按钮。`createRepairRecord()` 复核同一批条件后构造 `ChartRepairRecord`：前后两份完整 `ChartConfig`（配置对象全程不可变更新，因此快照天然不被改写）、修复前真实生效下界 `beforeAppliedMin`、原始 `BaselineDiagnostic` 证据、标题与轴标题快照，以及用**同一份** `ChartDataResult` 生成的 `beforeOption` / `afterOption`——两张图画的是同一批点、同一组类别顺序、同一份聚合结果，唯一差别是纵轴下界。修复动作本身只把 `config.yAxisStart` 换成 `{ mode: 'auto', raw: '' }`，第 4 步的整条链路自动重算，因此不存在「修复专用」的第二套判定，也不会把下界写死成 0。`describeRepairStaleness()` 在渲染期比对记录与当前画面（换文件 / 换类型 / 换 X / 换 Y / 换聚合 / 改起点 / 改标题单位），命中即清记录并如实说明原因；数据上下文用 `CsvTable` 的**对象引用**而非文件名，重新加载同名 CSV 视为新数据。`evaluateRepairUndo()` 先挡过期记录，再用当前 `yRange` 复核 `beforeConfig.yAxisStart` 是否仍能安全解析，不能解析就拒绝写回并给出说明。撤销只把 `beforeConfig` 整体交回，同样不触碰 CSV、字段与聚合；本轮按最小实现只保存一条记录，没有历史栈与重做。

6. **成果导出（Day 9，PNG + Markdown）**：导出一层不产生任何新的统计与判定，只搬运屏幕上已经算好的东西。`src/lib/chartExport.ts` 是决策层纯函数：`evaluateChartExport()` 依「准入 → 是否选定合法字段 → 是否有 option → 是否有绘制单元」的顺序给出按钮可用性与逐条对应的中文原因（准入被阻止时 PNG 禁用、报告仍可导出，因为报告记录的正是「为什么不能给结论」）；`describeExportTarget()` 用当前 `kindLabel` / 生效标题 / X、Y 字段 / 聚合口径 / 实绘单元数 / 触顶隐藏数拼出「这张 PNG 到底是哪张图」；`buildReportChartContext()` 把当次渲染的 `ChartDataResult`、`ChartScopeSummary`、`ResolvedYAxisStart`、`BaselineDiagnostic`、`ChartConfigSnapshot` 原样收敛成报告上下文，字段下标不全或没算出绘图结果就返回 `null`，报告随即写「当前画面没有可导出的图表」而不是编一份配置。PNG 侧 `src/lib/chartPngExport.ts` 复用的是 `ChartCanvas` 正在使用的那一份 option 对象引用：`buildPngExportOption()` 只在其上叠加表达配置（`animation:false`、白底、把 HTML 里显示的标题以 `title` 组件画进画布并按标题长度抬高 `grid.top`、保留原 `grid` 其它键），`series` / `xAxis` / `yAxis.min` 逐字不动；`exportChartPng()` 用一个有真实像素尺寸且 `position:fixed` 的临时容器起离屏实例，`setOption(option, true)` → `getZr().flush()` → 等帧（页面 `visibilityState === 'hidden'` 时跳过等帧，每帧另有 60 ms 超时兜底，避免后台页 `requestAnimationFrame` 不触发把导出挂起）→ `getDataURL({type:'png', pixelRatio:2, backgroundColor:'#ffffff'})` → base64 解码校验确实是 PNG → 交 `fileDownload.ts` 落盘；成功、失败、`init` 抛错、`getDataURL` 抛错四条路径都在 `finally` 里 `dispose()` 并移除临时 DOM，Object URL 延迟 4 秒回收。Markdown 侧 `src/lib/reportExport.ts` 按七段（数据来源 / 质量摘要 / 当前图表配置 / 参与与排除 / 风险诊断 / 修复记录 / 分析边界）装配纯文本，所有数字取自传入结果，`analyzeDataQuality()` 的计数、`ChartDataResult` 计数器与 `BaselineDiagnostic` 状态各归其位：`risk` / `clear` / `not-applicable` / `invalid-config` / `no-data` 五种写法不同，散点与折线不会被写成「全部检查通过」，自动范围不写成「下界恰好为 0」，未填单位保持「未填写」，修复段只在有有效 `ChartRepairRecord` 时出现；用户名、字段名、标题等一切外部文本都经 Markdown 转义（表格竖线、`#`、反引号、方括号、HTML 尖角括号与控制字符），文件名片段由 `sanitizeFileStem()` 去路径分隔符 / 控制字符 / `..` / Windows 保留名并按码点截断。两个入口都在点击那一刻重新生成，不缓存上一次配置的结果；`ChartExportPanel.tsx` 只渲染，并用「按钮互斥禁用 + 同步 `useRef`」保证同一帧内的重复点击不会起第二个离屏实例（两个处理函数的 `finally` 都必须重置该 ref，否则一次报告导出会把两个按钮永久锁死）。

**类别聚合**：`aggregateByCategory()` 是独立的纯函数，输入有效样本、输出每组 `{ category, rowIndexes, samples, mean, sum, n }` 的新对象。分组键是 X 单元格原文（仅裁首尾空白、区分大小写），组顺序按首次出现固定，重复类别用「类别 #数据行号」消歧并逐级升级保证唯一。`raw` 保持 Day 5 行为（一条记录一根柱子），`mean` 一个类别一根柱子并把 `n` 与原始行号一起进 tooltip 与分组明细，`sum` 额外给出可加性提醒。统计口径同时按两种单位报告：逐条模式的「有效记录 N 条」与聚合模式的「类别组共 M 组 / 实绘 K 根」；展示上限在聚合模式按「组」截断，`hiddenCategoryCount` 数被隐藏的组、`capHidden` 数这些组里的记录，两者从不混用。缺失与无效记录既不进分子也不进分母。

**时间序列**：`sort` 按 epoch 毫秒升序、同一时刻按上传顺序稳定保留，同日多条记录全部画出，不求平均、不求和、不去重。X 轴是数值轴承载 epoch 毫秒，但 `min` / `max` / `interval` 由 `dayAlignedTimeAxis()` 对齐到整天，刻度只会落在 UTC 零点，从而只渲染成 `2026-03-02` 这类日期文本；不对齐时 ECharts 会自己挑出「2026-03-01 21:20」这种 CSV 里根本不存在的合成时刻，容易被读成数据点。折线 `smooth: false`、无插值、无预测、无趋势线，缺失区间不会被凭空补齐。

**展示与计算的分离**：聚合结果保留完整精度，只在写进 DOM / tooltip 的字符串上用 `formatComputedValue` 缩略小数位（`13.139999999999997` 显示为 `13.14`，值本身不变；缩略后为 0 的极小量改用科学计数而不是显示成 0）。`summarizeChartScope()` 把「原始多少条 / 有效多少条 / 因何排除 / 实绘多少」连同方法说明拼成人能读的口径段落，是页面「参与绘图与排除记录」区块的唯一来源。

## 7. 状态管理

Day 1 只有一个共享状态，因此使用 `App.tsx` 内的 `useState`，不引入状态库：

```ts
const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
const [isParsing, setIsParsing] = useState(false);
const [resultToken, setResultToken] = useState(0);   // 每完成一次解析 +1
```

渲染分支：解析中 → 上传区显示「正在解析」；`ok` → `<DataPreview>`；`error` → `<ParseErrorPanel>`；`null` → 只显示首页与上传区。

结果定位由 `resultToken` 驱动（`commitOutcome` 同时写 outcome 与递增 token）：一次解析只滚一次，重复渲染不会反复滚动；面板顶部已落在视口上半部（`0 ≤ top ≤ innerHeight * 0.5`）时直接跳过。平滑滚动与否取自 `matchMedia('(prefers-reduced-motion: reduce)')`。成功结论同时写进常驻的 `sr-only role="status" aria-live="polite"` 文案，失败结论由 `ParseErrorPanel` 的 `role="alert"` 播报。

`DataPreview` 内部用局部 state 控制「再显示 N 行」与「再显示 N 条问题」的分批计数，并在 `table` 引用变化时回到首批（同一套 derived-reset 写法：渲染期比较 `sourceTable !== table` 就重置，不用 `useEffect` 回环）。`DataQualityPanel` 自己持有一份展开计数，统计结果用 `useMemo` 绑在 `table` 与准入结论上，因此换成另一份文件时不会串用上一份的统计或展开状态。

`ChartLab` 的状态是 Day 6 增量的核心，一共六项：`kind` / `xIndex` / `yIndex` / `aggregation` / `config`（`ChartConfig`，Day 7 起内含 `yAxisStart`）/ `contextNotices`。两条不变量由代码结构保证：

- **换文件即回到初始口径**：渲染期比较 `sourceTable !== table`，一旦成立就重置为柱状图默认字段、`raw` 聚合、`defaultChartConfig()`（含 `yAxisStart` 回到 auto）与空提示列表，上一份 CSV 的标题、单位、聚合与手动纵轴起点都不会残留成「看起来还在生效」的假配置。
- **类型 / 字段切换走同一条 `commit()` 路径**：先由 `resolveFieldsForKind()` 决定字段是否仍然适用（换到折线图自动挑日期列，散点图要求两个不同数值列），再由 `reconcileConfigForContext()` 决定「自动标题重算、手填标题保留、轴字段更换后清空标题与单位、离开柱状图后聚合口径退回逐条」各生成哪条说明。界面只渲染这些结果，不自己判断口径。

`EChartCanvas` 的 `key` 用 `${table.fileName}#${kind}`：换文件或换图表类型时销毁旧实例、重建新实例（避免旧系列残留），而在配置区打字、切换聚合只触发 `setOption(option, true)`，实例不重建，也不会随每次渲染重新初始化。`option` 用 `useMemo` 绑在数据结果与解析后的标题快照上，`prefers-reduced-motion` 继续决定动画开关。

## 8. 构建与测试配置

- `vite.config.ts` 同时被 Vite 和 Vitest 使用：默认 `environment: 'node'`，`include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`；需要 DOM 的组件测试在文件首行写 `// @vitest-environment jsdom` 单独切换环境，纯解析用例仍跑在 node 环境
- 组件交互测试用 `@testing-library/react` + `@testing-library/dom`（devDependency），断言只用 DOM 结构与文本（未引入 jest-dom 匹配器）；`scrollIntoView` / `getBoundingClientRect` / `matchMedia` 在测试里替换，浏览器端 `fetch` 与 `File.text()` 用 `vi.stubGlobal` / stub 文件对象模拟
- `tsc -b` 通过三个 project 分别检查浏览器代码、测试代码、构建脚本；测试文件（含 `.test.tsx`）不参与生产打包（Vite 只按 `main.tsx` 的 import 图打包）
- 生产产物：`dist/`（`index.html` + `assets/*` + `examples/plant-growth.csv` + `examples/baseline-demo.csv` + `favicon.svg`），是纯静态资源，满足 Qoder Sites 部署条件
- 路由：当前是单页首页，没有引入路由库；若后续增加多页面再考虑

## 9. 为后续功能预留的扩展点

| 计划功能 | 接入方式 |
| --- | --- |
| F2 数据质量检测 | **部分已实现（Day 3）**：`src/lib/dataQuality.ts` + `src/types/dataQuality.ts` 输入 `CsvTable`、输出准入结论与问题列表，不修改解析层。剩余子项（同一列类型不一致）需要新增列类型推断，建议放 `src/lib/columnTypes.ts`，由 `dataQuality.ts` 消费，仍不改解析层 |
| F2 剩余 / F3 异常值分析 | 新增 `src/lib/outlier.ts`（IQR / Z-score，需用户可选方法），前置条件是列类型推断；`analyzeDataQuality()` 里追加统计段与新的 `DataQualityFinding.kind`，UI 沿用同一套「准入 → 统计 → 问题列表」结构 |
| F4 图表生成 | **V2 已实现（Day 5 柱状 / 散点，Day 6 配置 + 聚合 + 折线）**：`src/lib/chartData.ts` 为纯函数适配器（读 `CsvTable` + 字段下标 + 图表类型 + 聚合口径，产出数据点、参与/排除统计与 ECharts option），`src/lib/chartConfig.ts` 管标题 / 轴标题 / 单位与差异比较，`src/lib/echartsCore.ts` 按需注册（新增 `LineChart`），`src/components/EChartCanvas.tsx` 只做实例生命周期、`ChartLab.tsx` 只做选择与文案；图表基于整份数据集计算、不受表格 50 行分页影响，无后端。误差棒、显著性标记等统计扩展在同一结构上追加，但需要先确认科学口径 |
| F5/F6 图表诊断与对比 | **V2 已实现（Day 7 检测 + Day 8 修复 / 对比 / 撤销）**：`src/lib/chartDiagnostics.ts` 是纯规则模块（读 `resolveYAxisStart().appliedMin` + `ChartDataResult.yRange`，产出结构化 `BaselineDiagnostic`），与 ECharts option 生成彻底分离；「输入 = 绘图 = 诊断」三者同源。Day 8 在其上用 `src/lib/chartRepair.ts`（纯规则）+ `src/components/ChartRepairPanel.tsx` 接出一条真实闭环：六门资格判定 → 只改 `chartConfig.yAxisStart` 的修复 → 同一份 `ChartDataResult` 生成的前后两张真实 ECharts 并排对比 → 「本次修复修改了什么？」差异表 → 单步撤销与安全拒绝。修复与撤销均不回写 `CsvTable`，记录随数据文件 / 字段 / 聚合 / 起点 / 标题单位的变化即时失效。报告导出已在 Day 9 落地（PNG + Markdown）；异常值标注仍未实现 |
| F7 报告导出 | 汇总各模块结构化结果后在前端生成文件，不依赖后端 |

扩展约束：任何统计结论都必须能追溯到 `CsvTable` 的具体行列，禁止写死示例数据或返回固定分数。
