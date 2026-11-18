# FigureGuard 架构说明

版本：v0.4（Day 4：字段类型识别与类型冲突检测）　　更新日期：2026-11-17

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
   │  ├─ DataPreview.tsx          统计卡片 + 格式问题列表 + 数据质量概览 + 数据表格
   │  ├─ DataPreview.test.tsx     分批加载、提示列表与质量概览集成的组件测试（jsdom）
   │  ├─ DataQualityPanel.tsx     数据质量概览：准入说明卡 / 四项统计 + 问题列表（逐批展开）
   │  ├─ DataQualityPanel.test.tsx 统计文案、逐批展开、阻止态与换文件重置（jsdom）
   │  ├─ ChartLab.tsx             图表实验室：图表类型 / X-Y 字段选择、标题与轴标题与单位配置区、聚合方式、参与与排除统计、空状态与上限提示
   │  ├─ ChartLab.test.tsx        类型切换、默认选择、换文件重置、准入阻止与实例清理 + Day 6 配置 / 聚合 / 折线图（jsdom，mock ECharts）
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
   │  ├─ echartsCore.ts           ECharts 按需注册（Bar/Line/Scatter + Grid/Tooltip + CanvasRenderer），集中 `echarts.use`
   │  ├─ chartData.ts             图表数据适配核心（无 UI 依赖）：字段资格、逐格数值校验、缺失/类型/日期排除计数、类别聚合（平均/求和）、时间序列解析与排序、上限截断、option 生成与注入转义、口径说明文本
   │  ├─ chartData.test.ts        图表数据适配单元测试（82 个场景：柱状/散点/折线、逐条与聚合口径、时间解析与排除、上限、不可变性与转义）
   │  ├─ chartConfig.ts           图表配置核心（无 UI 依赖）：默认标题生成、轴标题与单位拼装、文本清洗与长度上限、配置快照、差异比较、上下文变更后的标题保留与提示
   │  ├─ chartConfig.test.ts      图表配置单元测试（36 个场景：默认值、用户优先、单位不换算、重置与差异比较）
   │  ├─ display.ts               纯排版用的列视觉分类（数值/日期/文本 → 对齐方式）
   │  ├─ display.test.ts          视觉分类单元测试
   │  ├─ format.ts                字节数、计数与比率格式化
   │  └─ format.test.ts           格式化工具单元测试
   └─ types/
      ├─ csv.ts                    解析层数据契约
      ├─ dataQuality.ts            质量诊断数据契约（准入、逐列统计、重复组、问题条目、报告）
      └─ chart.ts                  图表层数据契约（图表类型、类别聚合口径、轴配置与图表配置）
```

依赖方向：`components → lib → types`。`lib/csv.ts` 与 `lib/dataQuality.ts` 都不引用任何 React 组件：质检只消费 `CsvTable`，便于单测也保证解析层不被反向依赖。`lib/display.ts` 只服务表格排版，不写入 `CsvTable`，与未来的数据类型推断相互独立。`lib/format.ts` 是三个模块共用的展示层工具（`formatBytes` / `formatCount` / `formatRate`），不含业务判断。`lib/chartConfig.ts` 与 `lib/chartData.ts` 同样不引用 React：前者只管「怎么标注」，后者只管「哪些数据参与计算」，`ChartLab.tsx` 只负责把两者的结果拼成界面，因此配置改动不会影响任何统计数字，统计口径也不依赖界面状态。

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
interface ChartConfig { title: string; titleEdited: boolean; xAxis: ChartAxisConfig; yAxis: ChartAxisConfig }
```

`titleEdited` 是整个配置层的支点：`false` 时标题跟随「图表类型 + 字段名 + 聚合口径」自动重算，`true` 时用户手写的标题在任何类型切换、字段更换、换文件之后都不会被无提示覆盖，只有在确实发生覆盖风险时由 `reconcileConfigForContext()` 生成一条说明（`title-manual` / `title-fallback` / `axis-field-reset` / `aggregation-dropped`）。单位字段同理：`unit` 只作为标注文本拼进轴标题（`株高（cm）`），系统不读它、不用它做任何换算，也不猜测单位；留空时界面显式写出「未填写单位（单位需要你自己确认，系统不会猜测或换算）」。

配置文本一律先清洗再展示：控制字符与不可见字符替换为空格、首尾空白裁掉、长度分别限 120 / 60 / 24（`MAX_TITLE_LENGTH` / `MAX_AXIS_TITLE_LENGTH` / `MAX_UNIT_LENGTH`）。清洗是「按未填写处理」而不是报错丢弃，因此粘贴进去的富文本不会让界面崩，也不会把 `<script>` 之类内容当成 HTML 注入——展示走 React 文本节点，tooltip 片段仍统一 `escapeHtml`。

`ChartConfigSnapshot` 与 `diffChartConfig(before, after)` 只比较配置本身，本轮不记录历史、不做诊断；这是给 Day 7「图表表达规范诊断」预留的输入接口。同一位置还预留了 Y 轴零基线判定的接入点：`toEChartsOption` 的柱状图 `yAxis` 显式 `scale: false` 且不设固定 `min`，将来 Day 7 只需读取 `ChartDataResult.yRange` 与该轴配置即可判断是否存在非零基线风险，无需改动数据结构。

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

## 6. 图表层流程（Day 5 引入，Day 6 扩展聚合与时间序列）

`computeChartData(table, kind, xIndex, yIndex, aggregation)` 一次产出「数据点 + 参与/排除统计 + 口径说明」，全程只读 `CsvTable.rows`，不改写、不删除、不补齐任何单元格。三段职责互不重叠：

1. **字段资格**（`evaluateFieldAvailability` / `fieldChoicesForAxis` / `dateFieldChoices`）：柱状图 X 轴接受类别列，Y 轴接受数值列；散点图两轴都要数值且不能同列；折线图 X 轴只接受被 `columnTypes.ts` 判为日期的列。类型冲突候选列仍可绘制，但会在说明里点明排除口径。
2. **逐格准入**：Y 数值走同一套 `evaluateNumericCell`，`''` / 纯空白 / 结构性缺列计入缺失，非数值文本与 `1e999` 计入无效，`0`、负数、合法小数一律照常参与。折线图另加日期准入：`parseDateParts` 只认「年在前的 `YYYY-M-D` / `YYYY/M/D`，可带 `HH:mm[:ss]`」，用 `Date.UTC` 组装，`isCalendarValidDate` 拒绝 `2026-02-30` 这类日历上不存在的写法；只到年月（`2026-01`）的值计入「精度不足」，明确报告而不补成某月第一天；完全不按日期写法解释的文本计入「不是支持的日期写法」。整个模块不调用 `Date.parse()`，不读浏览器时区。
3. **成图**：`toEChartsOption(result, { xLabel, yLabel, xName?, yName? })` 分别产出柱状 / 散点 / 折线 option。轴名 `xName` / `yName` 是「轴标题 + 单位」的画布文本（横向截到 18 字符、纵向 22 字符），而 tooltip 的键仍用字段原名，避免用户填写的标注被误当成字段本身；完整文本由 DOM 里的 `title` 属性与 `sr-only` 说明给出，画布截断不等于信息丢失。

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

`ChartLab` 的状态是 Day 6 增量的核心，一共六项：`kind` / `xIndex` / `yIndex` / `aggregation` / `config`（`ChartConfig`）/ `contextNotices`。两条不变量由代码结构保证：

- **换文件即回到初始口径**：渲染期比较 `sourceTable !== table`，一旦成立就重置为柱状图默认字段、`raw` 聚合、`defaultChartConfig()` 与空提示列表，上一份 CSV 的标题、单位与聚合选择不会残留成「看起来还在生效」的假配置。
- **类型 / 字段切换走同一条 `commit()` 路径**：先由 `resolveFieldsForKind()` 决定字段是否仍然适用（换到折线图自动挑日期列，散点图要求两个不同数值列），再由 `reconcileConfigForContext()` 决定「自动标题重算、手填标题保留、轴字段更换后清空标题与单位、离开柱状图后聚合口径退回逐条」各生成哪条说明。界面只渲染这些结果，不自己判断口径。

`EChartCanvas` 的 `key` 用 `${table.fileName}#${kind}`：换文件或换图表类型时销毁旧实例、重建新实例（避免旧系列残留），而在配置区打字、切换聚合只触发 `setOption(option, true)`，实例不重建，也不会随每次渲染重新初始化。`option` 用 `useMemo` 绑在数据结果与解析后的标题快照上，`prefers-reduced-motion` 继续决定动画开关。

## 8. 构建与测试配置

- `vite.config.ts` 同时被 Vite 和 Vitest 使用：默认 `environment: 'node'`，`include: ['src/**/*.test.ts', 'src/**/*.test.tsx']`；需要 DOM 的组件测试在文件首行写 `// @vitest-environment jsdom` 单独切换环境，纯解析用例仍跑在 node 环境
- 组件交互测试用 `@testing-library/react` + `@testing-library/dom`（devDependency），断言只用 DOM 结构与文本（未引入 jest-dom 匹配器）；`scrollIntoView` / `getBoundingClientRect` / `matchMedia` 在测试里替换，浏览器端 `fetch` 与 `File.text()` 用 `vi.stubGlobal` / stub 文件对象模拟
- `tsc -b` 通过三个 project 分别检查浏览器代码、测试代码、构建脚本；测试文件（含 `.test.tsx`）不参与生产打包（Vite 只按 `main.tsx` 的 import 图打包）
- 生产产物：`dist/`（`index.html` + `assets/*` + `examples/plant-growth.csv`），是纯静态资源，满足 Qoder Sites 部署条件
- 路由：当前是单页首页，没有引入路由库；若后续增加多页面再考虑

## 9. 为后续功能预留的扩展点

| 计划功能 | 接入方式 |
| --- | --- |
| F2 数据质量检测 | **部分已实现（Day 3）**：`src/lib/dataQuality.ts` + `src/types/dataQuality.ts` 输入 `CsvTable`、输出准入结论与问题列表，不修改解析层。剩余子项（同一列类型不一致）需要新增列类型推断，建议放 `src/lib/columnTypes.ts`，由 `dataQuality.ts` 消费，仍不改解析层 |
| F2 剩余 / F3 异常值分析 | 新增 `src/lib/outlier.ts`（IQR / Z-score，需用户可选方法），前置条件是列类型推断；`analyzeDataQuality()` 里追加统计段与新的 `DataQualityFinding.kind`，UI 沿用同一套「准入 → 统计 → 问题列表」结构 |
| F4 图表生成 | **V2 已实现（Day 5 柱状 / 散点，Day 6 配置 + 聚合 + 折线）**：`src/lib/chartData.ts` 为纯函数适配器（读 `CsvTable` + 字段下标 + 图表类型 + 聚合口径，产出数据点、参与/排除统计与 ECharts option），`src/lib/chartConfig.ts` 管标题 / 轴标题 / 单位与差异比较，`src/lib/echartsCore.ts` 按需注册（新增 `LineChart`），`src/components/EChartCanvas.tsx` 只做实例生命周期、`ChartLab.tsx` 只做选择与文案；图表基于整份数据集计算、不受表格 50 行分页影响，无后端。误差棒、显著性标记等统计扩展在同一结构上追加，但需要先确认科学口径 |
| F5/F6 图表诊断与对比 | 未开发，Day 6 已备好输入：**配置差异**用 `diffChartConfig(before, after)`，**Y 轴零基线风险**可用 `ChartDataResult.yRange` + 柱状图 `yAxis.scale: false`（当前不设固定 `min`，诊断只需读值、不需要改数据结构），**排除明细**已在 `excludedReasons` / `sources` / `rowIndexes` 里可追溯。规划上继续把诊断规则与 ECharts option 分离，便于做「修复前 / 修复后」两个 option 对比；本轮明确没有实现任何判定、一键修复、撤销历史或导出 |
| F7 报告导出 | 汇总各模块结构化结果后在前端生成文件，不依赖后端 |

扩展约束：任何统计结论都必须能追溯到 `CsvTable` 的具体行列，禁止写死示例数据或返回固定分数。
