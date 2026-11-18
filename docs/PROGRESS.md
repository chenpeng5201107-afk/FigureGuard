# FigureGuard 开发进度

赛道：2026 Qoder 高校创造力大赛 · StudyHack　　周期：14 天　　开发者：单人

---
## Day 6（2026-11-18）：图表配置与科学表达规范（F4 V2）

只做增量：复用 Day 5 的 `csv.ts` / `columnTypes.ts` / `chartData.ts` / `EChartCanvas.tsx` 架构，新增配置层与聚合、折线两种口径。未开发诊断、修复对比、历史记录与导出，未提交 Git、未推送、未发布。

### 修改文件

- 新增：`src/types/chart.ts`（`ChartKind` / `CategoryAggregation` / `ChartAxisConfig` / `ChartConfig`）、`src/lib/chartConfig.ts`、`src/lib/chartConfig.test.ts`
- 扩展：`src/lib/chartData.ts`（类别聚合 + 时间序列 + 口径说明 + option 轴名）、`src/lib/chartData.test.ts`、`src/lib/format.ts` + `format.test.ts`（只缩略展示文本）、`src/lib/echartsCore.ts`（增注册 `LineChart`）
- 重写界面层：`src/components/ChartLab.tsx` + `ChartLab.test.tsx`（配置区、聚合方式、折线图、口径区块）
- 文案同步：`src/App.tsx` 页脚、`src/components/ProductNotes.tsx` 当前版本范围声明
- 文档：`docs/PROGRESS.md`（本节）、`docs/ARCHITECTURE.md`（3.2 图表层契约、6 图表层流程、7 状态管理、9 扩展点）、`docs/ACCEPTANCE.md`（第 7 节日 6 验收）

### 任务 1：图表基础配置

- 标题、X/Y 轴标题、X/Y 单位全部可编辑，默认值由「图表类型 + 字段名 + 聚合口径」生成（`柱状图：按 group 逐条展示 height_cm` / `柱状图：按 group 计算 height_cm 平均值` / `散点图：speed 与 dose 的关系` / `折线图：height_cm 随 date 的变化`）。
- 用户改过的标题记 `titleEdited = true`：换类型、换字段、换文件都不无提示覆盖，只补一条说明（`图表标题仍是你手动填写的「…」`，并提供「恢复自动标题」按钮）。
- 单位只是标注：填 `cm` 不会做任何换算，轴标题拼成 `株高（cm）`；留空时显式写「未填写单位（单位需要你自己确认，系统不会猜测或换算）」。
- 配置文本先清洗再展示（控制字符替换为空格、裁首尾空白、限长 120 / 60 / 24），超长与只输入空格分别给出 `-long` / `-space` / `-blank` 说明；粘贴 `<script>alert(1)</script>` 作为标题原样显示，不生成脚本节点。
- 配置层是独立纯函数模块 + 独立类型文件，没有堆进 `ChartLab.tsx`；`ChartConfigSnapshot` 与 `diffChartConfig()` 为 Day 7 预备，本轮不做诊断与历史。
- 标题过长时画布外头 `line-clamp-2` 截断（实测 108 字标题在 375 px 宽下由 9 行压回 2 行、块高 52 px），完整文本仍在 `title` 属性与 `sr-only` 说明里，页面级横向滚动没有增加。

### 任务 2：分类聚合（柱状图）

- 默认仍是 Day 5 的「每条原始记录一根柱子」，文案明确写出「逐条原始记录展示，未进行分组求和、平均或其他聚合」。
- 「按类别计算平均值」一个类别一根柱子，tooltip 与分组明细给出类别、平均值、组内有效样本数 `n`、原始数据行号与计算依据；缺失与无效记录既不进分子也不进分母。
- 「按类别求和」非阻塞可选，附带可加性提醒：把高度、温度这类测量值相加不构成可解释比较，工具不替你判断可加性。
- 两种口径分开报告：逐条模式说「有效记录 N 条 / 实绘 N 根」，聚合模式说「类别组共 M 组 / 实绘 K 根」；截断上限在聚合模式按组计算，`hiddenCategoryCount`（被隐藏的组）与 `capHidden`（这些组里的记录数）不混用。
- `aggregateByCategory()` 独立可测，只生成新对象，不删除、不修改、不合并原始记录；组顺序按首次出现固定，大小写与不同写法不合并。
- 不做误差棒、标准差、显著性检验；计算保留完整精度，小数位只在展示文本缩略（`13.139999999999997` → `13.14`，值本身不变）。

### 任务 3：时间序列折线图

- 类型切换区新增「折线图」，X 轴只接受被 `columnTypes.ts` 判为日期的列，Y 轴接受数值列。
- 日期一律按 UTC 解释，不用 `Date.parse()`、不读浏览器时区；只认年在前的 `YYYY-M-D` / `YYYY/M/D`（可带时分秒）。
- 只到年月的值报告为「精度不足以定位具体日期」，不补成某月第一天；`2026-02-30` 这类日历无效值与「不是支持的日期写法」分别计入排除明细。
- 升序排序、同一时刻按上传顺序稳定保留；同日多条记录全部画出，不默认平均、不求和、不去重；缺失值不变成 0，不插值、不平滑、不预测、不加趋势线，说明里写明「折线连接的是当前可用的观测点」。
- tooltip 给出原始日期文本、原始数值与数据行号；展示上限（2000）与无效排除分开说明。
- X 轴刻度由 `dayAlignedTimeAxis()` 对齐到整天：不对齐时 ECharts 会自己生成 `2026-03-01 21:20` 这类 CSV 里根本不存在的合成时刻，容易被读成数据点。

### 任务 4：配置区交互与页面设计

- 布局：上方类型切换 + X/Y 字段 → 主区域图表预览 → 配置区（标题 / 轴标题 / 单位 / 适用的聚合）→ 下方「参与绘图与排除记录」口径区块；青绿主色 `#0D9488`、`#0F172A`、`#F8FAFC` 不变。
- 换类型保留仍然适用的设置，不适用的（散点 / 折线的聚合口径）退回逐条并说明；手填标题不被覆盖；换 CSV 后字段选择、标题、单位、聚合全部复位；散点与折线不显示类别聚合控件；逐条与聚合的统计同步；无日期字段 / 数值字段不足 / 配置无效都给可读空状态而不是崩溃；移动端纵向堆叠；无遮挡；控件全部有可读 label 且可键盘到达。

### 开发中修掉的三个真实缺陷

1. 折线图 X 坐标塌成 0：`computeChartData()` 里 `xValue` 沿用 Day 5 的 `kind === 'scatter' ? … : null` 三元判断，折线的 x 全部落到 0，`timeRange` 变成 `0 – 0`。改为按轴角色判断（只有类别轴没有数值 x），时间与排序随之恢复。
2. 聚合共享输入引用：`aggregateByCategory()` 直接 `push(sample)`，让分组结果与调用方传入的样本对象共享引用，破坏了「聚合只生成新对象」的边界。改为逐条 `{ ...sample }` 拷贝。
3. 折线刻度的合成时刻：见任务 3 最后一条，用整天对齐 + 间隔向上取整解决，并补 3 个用例钉住刻度序列。

### 测试（258 → 391，新增 133 项，Day 1–5 断言一项未删）

| 文件 | 数量 | Day 6 变化 |
| --- | --- | --- |
| `src/lib/chartConfig.test.ts` | 36 | 新建：默认标题、用户优先、单位拼装与不换算、清洗与限长、复位说明、`reconcileConfigForContext`、`diffChartConfig` |
| `src/lib/chartData.test.ts` | 24 → 82 | +58：`aggregateByCategory` 平均值 / 求和 / 单条组 / 0 与负数 / 大小写不合并 / 行号可追溯 / 引用隔离；聚合统计口径与按组截断；`parseTimeCell` 与折线数据、排序、排除种类、上限、不插值映射；`formatTimeTick`；option 轴名与 tooltip；整天对齐刻度；`summarizeChartScope` |
| `src/components/ChartLab.test.tsx` | 14 → 48 | +34：标题 / 轴标题 / 单位编辑与不覆盖、只改表达不改数据、聚合切换与实例不重建、折线图字段自动选择与说明、上限文案、换文件复位、禁用态与空状态、内置示例三体验 |
| `src/lib/format.test.ts` | 4 → 9 | +5：`formatComputedValue` 的浮点尾数、求和 / 平均误差、0 与负值、极小值转科学计数、不可表示值显示「无法计算」 |
| Day 1–5 其余 8 个文件 | 220 | 未改动任何断言，全部保持通过 |

### 命令结果（实际执行）

本机 `PATH` 里没有 `node`（`node -v` → `command not found`，`npm …` → `exec: node: not found`），因此没有直接跑 `npm run lint` / `npm test` / `npm run build`，而是用同一个 Node 可执行文件 `D:\Soft_Ware\node.exe`（v25.2.1）调用各包自带的二进制，执行的是与 npm 脚本完全相同的入口：

| 等价命令 | 结果 |
| --- | --- |
| `node node_modules/oxlint/bin/oxlint`（= `npm run lint`） | `Found 0 warnings and 0 errors.`（35 个文件，116 条规则） |
| `node node_modules/vitest/vitest.mjs run`（= `npm test`） | `Test Files 12 passed (12)`，`Tests 391 passed (391)`，12.8 s |
| `node node_modules/typescript/bin/tsc -b`（= `npm run build` 第一步） | 无输出即通过 |
| `node node_modules/vite/bin/vite.js build`（= `npm run build` 第二步） | 587 个模块，`CSS 24.41 kB (gzip 5.66)`、`JS 817.00 kB (gzip 268.05)`；仍只有 echarts 导致的单包 > 500 kB 提示，非错误 |

另有两类不在 npm 脚本里的验证：临时用 ECharts SSR（SVG renderer）把真实 option 在 1440 / 1280 / 375 px 下渲染成字符串，确认零 ECharts 告警、轴名与刻度文本正确（折线刻度从合成时刻修正为整天日期）；该探针文件验证后已删除，仓库里没有留下临时脚本。

### 真实浏览器验证（开发服务器 5178 + 同尺寸 iframe 真实 Blink 布局）

顶层内置浏览器仍是 `viewport=0x0`（`elementFromPoint` 返回 null、无像素截图），但**视口为 0 不影响 iframe 内自身布局**：把应用装进 1280 / 1440 / 375 px 的 iframe 后，`contentWindow.innerWidth` 分别报告 1280 / 1440 / 375，Tailwind 断点与 ECharts 的 Canvas 都按该宽度真实渲染，读回的是真实 DOM 与几何值。

| 检查点 | 实测值 |
| --- | --- |
| 横向溢出 | 1440：`scrollWidth/clientWidth = 1425/1425`；1280：`1265/1265`；375：`360/360` —— 三种宽度都没有页面级横向滚动（唯一超宽的是数据表格自身 `min-w-[28rem]`，它在 `table-scroll` 容器内滚动，不算页面溢出） |
| 移动端排版顺序 | 375 下预览块 top 3816 → 配置区 4402 → 口径区块 5192，纵向堆叠，配置控件未被遮挡 |
| 长标题 | 108 个字符的标题在 375 px 下块高 52 px、`-webkit-line-clamp: 2`，`textContent` 与 `title` 属性仍是完整 108 字，`scrollWidth` 不变 |
| 体验一（逐条柱状图） | 画布 978×420 且有实际绘制像素（Canvas 非透明像素 10,127）；统计「原始 12 / 有效 10 / 缺失排除 2 / 类型排除 0 / 展示 10 个数据点」、缺失细分「空字符串 2 条」、Y 范围 `-4.2 – 88.6`（88.6 与 -4.2 都在），并写明未做聚合 |
| 体验二（平均值聚合） | 「本图按类别聚合后实际绘制 2 根柱子（类别组共 2 组）」、Y 范围 `13.14 – 26.44`、`n` 与原始行号进入明细、明确「不生成误差棒、标准差、显著性标记」 |
| 体验三（折线图） | 10 个数据点、时间口径说明含「不使用 Date.parse、也不读浏览器时区」与「不做插值、平滑、预测或趋势线」、绘图时间范围（UTC）`2026-03-02 – 2026-03-07`、Y 范围 `-4.2 – 88.6` |
| 打字不重建实例 | 依次输入图表标题 / X 轴标题 / Y 轴标题 / 单位，`_echarts_instance_` 前后同为 `ec_1795006678276`，统计数字逐字不变，画布仍 978×420；只有切类型 / 换文件时才换新实例（`ec_…278` / `ec_…999`），DOM 中始终只有 1 个 canvas |
| 换 CSV 复位 | 手填「手动改过的标题」后改传 `cap120.csv`：标题输入框回到空、显示自动标题「柱状图：按 g 逐条展示 v」，聚合回到 `raw` |
| 展示上限（真实数据） | 120 行逐条：「有效记录共 120 条，本图仅展示前 100 条，另有 20 条有效记录未显示。这不是无效被排除，只是单图展示上限。」120 组求平均：「实际绘制 100 根柱子（类别组共 120 组）」+「另有 20 组（包含 20 条有效记录）没有成柱」 |
| 不适用配置的可见性 | 切散点 / 折线时类别聚合单选消失；离开柱状图后说明「聚合方式只适用于柱状图的类别轴…已回到逐条原始记录」 |
| 无可用的日期字段 | `cap120.csv` 切折线：`chart-empty`「没有可用作 X 轴的日期字段…（如 2026-03-02）」，两个下拉置灰，不画布不崩 |
| 数值字段不足 | plant-growth.csv 切散点：「散点图需要两个不同的数值字段，当前可用数值字段只有 1 个，无法成对绘制。」 |
| 注入与准入 | 标题里的 `<script>alert(1)</script>` 只作为文本出现（文档内脚本节点均不含 `alert(1)`）；上传行列不一致的 `bad.csv` 走 `chart-blocked`，不初始化 ECharts，表格与解析告警照常浏览 |
| 键盘与标签 | 可见可聚焦控件 16 个、全部有关联 label（隐藏的 `input[type=file]` 不是 tab 停靠点），聚合单选组在 `fieldset` + `legend「图表配置（只影响表达，不改动数据）」` 内，单选组始终恰有一个选中 |
| Day 1–4 回归 | 12 行示例「第 1 / 1 页、本页 1–12 条」；120 行「第 1 / 3 页、本页 1–50 条」、`tbody` 50 行；质量统计「12 行 / 1 / 4 列 / 缺失 2 个 / 重复 0 行」未变 |
| 控制台 | 全程无 error（18 条消息只有 vite debug、React DevTools 提示、HMR 更新，以及我自己的 `getImageData` 探针告警） |

### 已知问题

- tooltip 的悬浮弹出没有在本轮自动验证：顶层视口 0×0 导致 `elementFromPoint` 返回 null，合成 `mousemove` 打不到数据点。tooltip 内容由 `formatter` 单测与 SSR 探针逐字验证过，真实鼠标悬浮仍需人工确认。
- 像素截图仍未取得（同上原因），本轮浏览器结论是真实 Blink 的 DOM 与几何测量。
- 折线图刻度按「最多 6 段」取整间隔：数据跨度极小时只显示两个日期刻度，跨度极大时（多年）间隔会大于一天，仍是整天日期但不一定落在观测日期上——需要更贴合人类读法的「按月 / 按季度」步长时，应作为 Day 7 之后的显式改进项，本轮没有自行加规则。
- 聚合分组按 X 单元格原文分组，`Control` 与 `control`、` 2026-03-02 ` 与 `2026-03-02` 是两组（后者已裁首尾空白）；这是有意为之，避免把不同写法静默合并。
- `docs/PRD.md` 的「交付范围」章节仍停在 Day 3，本轮按任务要求只更新 PROGRESS / ARCHITECTURE / ACCEPTANCE 与页面文案，没有改动 PRD。
- 工作区里还有两份非我产生的压缩包快照 `src.zip`、`public.zip`（未跟踪），我没有删除或改动它们。

### 是否需要人工验收

需要：① 真实窗口里看 375 / 1280 / 1440 三档排版与折线刻度密度是否舒服；② 用鼠标悬浮确认 tooltip 弹出位置与内容；③ 确认标题超过 120 字被截断、只输入空格按未填写处理这些边界提示是否容易被理解；④ 确认「按类别求和」在测量值场景的提醒措辞够不够醒目。

### 下一步（未开工，等你确认）

Day 7 的输入已就位：`ChartConfigSnapshot` + `diffChartConfig()` 可比较任意两份配置；`ChartDataResult.yRange` 与柱状图 `yAxis.scale: false` 是不零基线判定的落点，无需改数据结构；`excludedReasons` / `sources` / `rowIndexes` / `timeRange` 提供可追溯证据。等待你确认后再开始诊断规则，本轮不提前开发。

---
## Day 5 最终补丁（2026-11-18）：轴标签转义修正 + 类别标签严格唯一

只改 `src/lib/chartData.ts` 与 `src/lib/chartData.test.ts` 两个文件，未触碰解析、质量诊断、容器与 UI，未开发 Day 6，未提交 Git、未推送、未发布。

### 问题一：Canvas 坐标轴标签被 HTML 转义

`toEChartsOption()` 里柱状图 X 轴 `axisLabel.formatter` 原本是 `escapeHtml(truncateLabel(value))`。ECharts 的 Canvas 渲染把 formatter 返回值当**纯文本**绘制，不做 HTML 解析，于是 `A&B` 在坐标轴上被画成字面的 `A&amp;B`。

- 改为 `truncateLabel(value)`：轴标签恢复原文可读形式，长标签仍然只截断到 12 字符加省略号。
- `tooltip` 的两个 formatter（柱状图与散点图）**保持 `escapeHtml` 不变**，CSV 原文进入 HTML 片段时仍然转义，注入面没有扩大。

### 问题二：重复类别的极端碰撞

原逻辑先算一次带行号的标签，冲突时只补一次 `·${usedLabels.size}`，不能严格保证唯一。现在按展示顺序逐个分配并在冲突时持续升级，直到该标签未被使用过才落地：

1. 只出现一次的类别先用原文；重复类别先用「类别 #数据行号」。
2. 该首选已被占用 → 退回「类别 #数据行号」。
3. 仍被占用 → 依次追加 ` (2)`、` (3)`……直到唯一。

终止性由「已用集合有限、计数无上界」保证；因为第 2 步起就带上数据行号，任何消歧结果都能追溯回原始记录行。同一份输入两次计算结果逐字一致（已加断言）。

### 新增回归测试（4 项，20 → 24）

- `Canvas 坐标轴标签保留原文可读形式，不出现 HTML 实体`：`A&B` / `<x>` / `a>b` 三个类别原样进入轴标签，formatter 输出不含实体。
- `轴标签缩略保留 & < > 原文，同时 tooltip 仍然必须 HTML 转义`：超长含 `&<>` 的类别在轴上是 `A&B&C<D&E>F&…`（截断但无实体），在 tooltip 里是 `A&amp;B&amp;C&lt;D&amp;E&gt;F&amp;G`。
- `类别本身已含消歧后缀时持续消歧直到唯一（确定性结果）`：`['A #2','A','A']` 逐字断言为 `['A #2','A #2 (2)','A #3']`——原文类别抢占了 `'A #2'`，重复类别必须继续升级而不是产出重名。
- `大量互撞类别（含 #1/#2 与已有消歧后缀）展示集合内标签全部唯一且可追溯到行号`：12 行里混入 `A #1`、`A #2`、`A #1 (2)`、`A #2 #3` 等本身就像消歧结果的类别，断言标签集合大小等于点数、出现过多于一次的类别标签必含自己的 `#数据行号`、重复计算结果一致。

### 命令结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（32 个文件，116 条规则） |
| `npm test` | `Test Files 11 passed (11)`，`Tests 258 passed (258)`（Day 1–4 的 220 项与 Day 5 原有 34 项全部保持通过，无回归） |
| `npm run build` | `tsc -b && vite build` 成功；`CSS 24.08 kB (gzip 5.58)`、`JS 776.65 kB (gzip 254.30)`，仍只有 echarts 导致的单包体积告警 |

### 必须守住的结论（逐条复核）

- 原有测试一项不减：254 → 258，只增不减，且没有放宽任何既有断言。
- 植物样例仍是原始 12 / 有效 10 / 缺失排除 2 / 类型排除 0 / 展示 10（`computeChartData` 的示例用例仍绿）。
- 散点图计数与配对逻辑、柱状 100 / 散点 2000 的上限与 `capHidden` 口径未改动，相应用例全部通过。
- `computeChartData` 依旧只读 `table.rows`，「逐引用 + 逐值快照」的不可变性用例通过。

### 已知限制

- 轴标签的实际绘制效果无法在本轮内置浏览器（`viewport=0x0`、无 Canvas）里做像素确认，本补丁的证据是 formatter 返回值与数据结构断言；真实浏览器里 `A&B` 是否正确显示仍需人工看一眼。
- 消歧后缀 ` (2)` 是兜底路径，正常数据里几乎不会出现；若将来类别本身就大量带 ` #N` 形态，建议改成更明确的「类别（第 N 行）」形式，需要先确认展示口径。

### 是否需要人工验收

需要：在真实浏览器确认 ① 坐标轴上 `&` / `<` / `>` 显示为原文；② 超长类别仍是「截断显示 + tooltip 全文」；③ tooltip 里的原文依旧被正确转义（不出现可执行标签）。

---
## Day 5（2026-11-18）：ECharts 图表工作台 V1（F4 部分）

范围严格限定为「把已解析的数据画成可追溯的真实图表」：柱状图 / 散点图、字段选择、参与与排除统计。未做折线图、误差棒、图表表达诊断（F5）、修复对比（F6）、报告导出（F7）、异常值（F3），未重构解析与质量诊断逻辑，未提交 Git、未推送、未发布。

### 新增文件

| 文件 | 作用 |
| --- | --- |
| `src/lib/echartsCore.ts` | 按需注册 ECharts（`echarts/core` + Bar/Scatter + Grid/Tooltip + CanvasRenderer），集中 `echarts.use`，导出实例类型 |
| `src/lib/chartData.ts` | 纯函数数据适配器：字段资格、逐格数值校验、缺失 / 类型排除计数、单图上限截断、ECharts option 生成与注入转义；不读写任何 UI 状态，不修改 `CsvTable` |
| `src/lib/chartData.test.ts` | 适配器单元测试 20 项 |
| `src/components/EChartCanvas.tsx` | 可复用容器：挂载 `init`、option 变化 `setOption(_, true)`、`ResizeObserver` + `window.resize` 触发 `resize`、卸载 `dispose`；固定高度、`role="img"` + 读屏说明 |
| `src/components/ChartLab.tsx` | 图表实验室 UI：图表类型切换、X/Y 字段选择、参与与排除统计、空状态与上限提示；准入直接复用 `evaluateQualityAdmission` |
| `src/components/ChartLab.test.tsx` | 交互与生命周期测试 14 项（jsdom，mock `echartsCore`） |
| `src/components/DataPreview.tsx` | 在数据表格 / 分页之后挂载 `<ChartLab table={table} />`（仅 2 行改动，不动既有预览与质量概览） |

### 数据正确性规则（逐条可追溯到原始 CSV）

- 字段选择用**列下标**而不是列名；资格判断复用 `analyzeColumnTypes()`：柱状图 X 取文本 / 类别列、Y 取数值列；散点图 X、Y 都取数值列且必须是两个不同字段。
- 数值单元格先过既有 `classifyCellValue` 的数值形态，再要求 `Number.isFinite`：`1e999`、`Infinity`、`12.4 kg`、`abc` 一律不算有效测量；**不用 `parseFloat`** 做部分解析；`0`、负数、合法小数与科学计数原样保留，不做未要求的四舍五入。
- 标识符列（含 id / 编号 / 学号 / 前导零）不自动转数值，默认也不选为绘图字段。
- 排除口径互斥且每条只计一次：`缺失（结构性缺列 / 空字符串 / 纯空白）` 与 `无效（非数值文本 / 非有限）` 分开；守恒式「有效 + 缺失 + 无效 = 原始记录数」在用例里钉死。
- 柱状图**逐条原始记录成条，不做分组求和或平均**；类别重复时用「类别 #数据行号」后缀区分，避免 ECharts 把同名类别错误合并。
- 统计基于**整份数据集**，不受表格 50 行分页影响（用 60 行夹具专门验证）。
- 单图上限：柱状 100、散点 2000；触顶时显著提示「符合条件的记录共 X 条，本图仅展示前 N 条，另有 Y 条有效记录未显示」，并把「有效但未显示」与「无效被排除」严格分开。
- 准入：结构降级或任一解析错误时只给原因、不出正式图表（`chart-blocked`）；notice 级提示不阻止绘图。
- 字段原值进入标题 / tooltip 前统一 `escapeHtml`，防注入。

### 真实结果

- plant-growth.csv 默认柱状图：原始 12 / 有效 10 / 缺失排除 2 / 类型排除 0 / 展示 10；保留 88.6 与 -4.2；明确标注逐条原始记录、未分组聚合。
- 两数值字段散点（夹具 `name,speed,dose` 7 行：C 空 speed、D `abc` speed、E 空 dose）：原始 7 / 有效 4 / 缺失排除 2 / 类型排除 1 / 展示 4，X 自动 `speed`、Y 自动 `dose`。

### 命令结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（32 个文件，116 条规则） |
| `npm test` | `Test Files 11 passed (11)`，`Tests 254 passed (254)`（Day 1–4 既有 220 项一项不减；新增 20 + 14 = 34 项） |
| `npm run build` | `tsc -b && vite build` 成功，586 个模块；`CSS 24.08 kB (gzip 5.58)`、`JS 776.36 kB (gzip 254.21)`；唯一提示为 echarts 触发单包 > 500 kB 的体积告警，非错误 |

### 浏览器验证（5178，真实 DOM 读取）

内置浏览器无可视表面（`viewport=0x0`），指针点击 / 截图不可用；改用 `evaluate_script` 派发真实 `click` 与文件 `change` 事件走既有解析路径，读回渲染后的 DOM 文本、`<select>` 值与几何值：默认柱状图统计、单数值字段切散点的空状态、换 CSV 后状态重置、两数值字段散点计数、结构降级的阻止态均与预期一致；表格分页 / 定位 / 质量概览无回归（DataPreview 46 项仍全绿）。

### 已知问题

- ECharts 使首屏 JS 体积显著增大（gzip 约 254 kB），未做按需分包；后续可用动态 `import()` 把图表实验室拆成懒加载块。
- jsdom 没有 Canvas，`EChartCanvas` 的 `init/setOption/dispose` 在无 Canvas 环境下用 try/catch 跳过绘制，因此 DataPreview 测试会出现 `getContext` / `DOM width` 的 stderr 警告（不影响断言）；真实浏览器有 Canvas 时正常渲染。
- 375 / 1280 / 1440 真实窄宽屏排版与像素截图本轮未做（`viewport=0x0`），仅结构验证。
- 仅做 V1：折线图、误差棒、坐标轴/图例表达诊断、修复前后对比、PNG / Markdown / PDF 导出、IQR / Z-score 异常值仍为空白。

### 是否需要人工验收

需要：① 真实多分辨率下图表与画布排版、横向是否溢出；② 柱状 100 / 散点 2000 上限与触顶文案是否醒目够用；③ 重复类别「类别 #行号」后缀是否直观；④ 首屏是否要把图表实验室懒加载以减小主包体积。

### 下一步（未开工，等你确认）

Day 6 候选：图表表达诊断（F5，需先定规则与严重级别）或把图表实验室懒加载分包；异常值（F3）与导出（F7）仍需单独授权。Day 5 到此停止，等待人工与 ChatGPT 代码审查；本轮未提交 Git、未推送远程、未发布站点。

---
## Day 4（2026-11-17）：字段类型识别与类型冲突检测

### 新增功能

1. **字段类型推断模块** `src/lib/columnTypes.ts`：
   - 单元格级别类型投票：数值（整数/小数/负数/科学计数法）、日期（年在前的写法，必须通过日历校验）、文本或类别
   - 空字符串、纯空白与缺列不参与投票，避免误判
   - 标识符字段识别：字段名含 id/编号/学号/code/phone 等线索时直接按文本处理，不做冲突比对
   - 前导零编码（如 007）识别为文本，不被误判为数值
   - 带单位的数值（如 12.4 kg）识别为文本形态
   - 整列结论：有效样本少于 3 个 → 无法确定；主要形态占比低于 70% → 无法确定
2. **类型冲突检测**：
   - 当一列具有稳定的主要类型时，标出与该类型不一致的单元格
   - 报告字段名、推断类型、依据、有效样本数、冲突数、行号、原始值、谨慎建议
   - 每列最多列出 20 处冲突候选（MAX_ITEMIZED_TYPE_CONFLICTS），超出只计入总数
   - 只报告、不修改、不删除、不填充任何单元格
3. **数据质量概览增强**：
   - 新增「字段类型概览」区块，展示每列的类型卡片
   - 类型卡片支持点击冲突候选定位到表格对应列与行（P1 交互）
   - 定位后高亮显示目标列与行，出现定位提示条，支持取消定位
   - 换文件时清除定位状态
4. **测试覆盖**：34 个字段类型测试 + 4 个定位交互测试
5. **UI 修正**：HeroPanel 标题移动端字号调整、页脚与 ProductNotes 更新版本范围说明

### 测试与构建结果

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | 0 warnings, 0 errors |
| `npm test` | 199 tests passed |
| `npm run build` | 成功，295.71 kB JS (gzip 94.58 kB) |

---

## Day 4 验收整改（2026-11-17）：分页定位 + 减少动态效果 + 类型卡片首屏数量

### 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/components/DataPreview.tsx` | P0 跨行定位改为真分页；P1 定位滚动改为容器内单一次 `scrollTo` 并响应 `prefers-reduced-motion` |
| `src/components/DataQualityPanel.tsx` | P2 字段类型卡片首屏 40 → 8，冲突字段优先、其余分批展开、卡片标注原始列号 |
| `src/components/DataPreview.test.tsx` | 原「批量渲染」2 项改写为分页回归测试；新增「跨行定位的分页安全」7 项 |
| `src/components/DataQualityPanel.test.tsx` | 新增「字段类型概览（Day 4 整改）」2 项 |

### P0：定位到第 5 万行会把前面的行全部挂进 DOM

- 原因：`handleFocusColumn()` 为了「让目标行可见」把 `renderedRowCount` 直接抬到下一个 50 的倍数，点第 50,000 行就渲染约 50,000 行，等于把 Day 1 做的首屏批量渲染保护整个绕开；也没有翻页入口。
- 方案：删掉 `INITIAL_ROW_COUNT` / `ROW_BATCH_SIZE`，改为固定 `ROW_PAGE_SIZE = 50` 的页码模型（`pageIndex` → `pageStart` → `table.rows.slice(pageStart, pageStart + 50)`）。
  1. 一次只渲染一页 50 条记录。
  2. 点类型冲突候选直接把 `pageIndex` 设为 `Math.floor(rowIndex / 50)`，只渲染目标所在那一页。
  3. 行序号按原始 CSV 数据行计算（`pageStart + offset`），翻页不重新从 1 编号。
  4. 目标行 `bg-amber-50`、目标列整列单元格与表头 `bg-amber-100` 高亮，定位提示条写明「第 N 页」。
  5. 新增 `返回第一页 / 上一页 / 下一页`，首末页对应按钮 disabled。
  6. 表头 `sticky top-0 z-20`、`max-h-[26rem] overflow-auto`、响应式类名一律未动。
  7. 换文件时用「渲染期派生重置」把 `pageIndex`、`renderedIssueCount`、`focusTarget` 一起归零，不沿用上一份文件的页码与高亮。
  8. 只读 `table.rows`，不改写数据、不改诊断结果（用 JSON 快照断言）。
  9. 不是「DOM 全渲染再隐藏」：50,000 行文件在真实浏览器里 `<tbody>` 只有 50 个 `<tr>`、全站 471 个元素。

### P1：定位滚动不再带动整页跳动，并尊重「减少动态效果」

- 原来用 `element.scrollIntoView()`，它会连祖先容器和整页一起滚，长页面点一次跳一次。
- 改为只读表格容器自己的 `getBoundingClientRect()` 差值，计算 `left`（把目标列滚进视野）与 `top`（目标行居中并夹在 `[0, scrollHeight - clientHeight]`），一次定位只发一次 `container.scrollTo({ left, top, behavior })`；本组件已无 `scrollIntoView` 调用点（测试断言 `not.toHaveBeenCalled()`）。
- `behavior` 取决于 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`：开启时 `auto` 直接定位，否则 `smooth`。写法与 `src/App.tsx:51` 的既有约定一致。

### P2：字段类型概览首屏太长

- 首屏由 40 张卡片降为 8 张（`INITIAL_TYPE_CARD_COUNT = 8`），其余每批 8 张展开。
- 排序改为「有类型冲突候选的字段在前，其余在后」，两组内部都保持原始列序；排序在 `[...columnTypes.columns]` 副本上做，诊断数组没有被原地修改。
- 每张卡片头部新增等宽的「第 N 列」徽标，就是它在源文件里的原始 1 基位置，并补一段说明：顺序调整不影响任何统计数字。
- 类型推断、占比、冲突计数、依据文案全部未改。

### 测试（199 → 208，新增 9 项、改写 2 项）

| 覆盖点 | 断言 |
| --- | --- |
| 50 行内定位 | 不换页、目标行与目标列高亮 |
| 第 2,000 行定位 | DOM 行数 ≤ 50、首行序号 1,951、`data-row-anchor="1999"` 高亮、第 40 / 40 页 |
| 第 50,000 行定位 | 只有 50 行、首行 49,951、第 1,000 / 1,000 页、`data-row-anchor="0"` 不在 DOM 里 |
| 高亮正确性 | 行 `bg-amber-50`、列单元格与表头 `bg-amber-100` |
| 换文件重置 | 页码回到 1、高亮与定位提示条清空 |
| 滚动行为 | 默认 `behavior: 'smooth'` 且一次定位只 `scrollTo` 一次；`scrollIntoView` 从未被调用 |
| 减少动态效果 | stub `matchMedia` 命中后 `behavior === 'auto'` |
| 数据不被改写 | 翻页与定位前后 `table.rows` JSON 快照、记录数、质量统计数字全等 |
| 类型卡片首屏 | 首屏 `[2, 8, 0, 1, 3, 4, 5, 6]`、冲突字段文案与「第 3 / 9 列」徽标、统计数字不变 |
| 类型卡片展开 | 展开后 `[2, 8, 0, 1, 3, 4, 5, 6, 7, 9]` 与「已显示全部 10 个字段的类型卡片」 |

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（26 个文件，116 条规则） |
| `npm test` | `Test Files 9 passed (9)` / `Tests 208 passed (208)`，Duration 3.53s |
| `npm run build` | `tsc -b && vite build` 成功，29 modules，155ms；index.html 0.69 kB、CSS 23.33 kB (gzip 5.47)、JS 297.11 kB (gzip 95.04) |

### 浏览器验证（开发服务器 5211，真实 Blink 布局）

内置浏览器的标签页处于隐藏状态（视口 0×0），无法截图；`input[type=file]` 是 `display:none`，CDP upload 与合成 `change` 事件都驱动不了 React 的 onChange，因此改走 `handleDrop` 的拖放路径（`new DataTransfer()` + 合成 `drop`），React 正常接收。

- 12 条示例数据：`共解析 12 条记录，第 1 / 1 页， 本页显示第 1–12 条。`，12 个 `<tr>`，容器类名 `isolate mt-5 max-h-[26rem] overflow-auto` 保持。
- 拖入 5,000 行：DOM 仅 50 行并出现三个翻页按钮；点冲突候选 → 第 100 / 100 页、`本页显示第 4,951–5,000 条`、高亮行序号 `5,000`、提示条 `已定位到第 2 列「height_cm」，第 5,000 个数据行（第 100 页）`、只发一次 `scrollTo({ behavior: 'smooth', top: 1492, left: 254.3 })`。
- 拖入 50,000 行（P0 原始故障场景）：解析后 DOM 50 行 / 全站 471 个元素；点第 50,000 行候选 → 第 1,000 / 1,000 页、`49,951–50,000`、`data-row-anchor="0"` 不存在、一次 `scrollTo`、下一页按钮 disabled。
- 把 `matchMedia` 覆写为命中 reduce 后重新定位：`scrollTo` 的 `behavior` 变成 `auto`。
- 点「返回第一页」→ 回到第 1 / 100 页且首行 `data-row-anchor="0"`；点「取消定位」→ 提示条与高亮消失。
- 拖入 12 列 × 6 行（第 3、9 列各 1 处冲突）：首屏 8 张卡片顺序 `[2, 8, 0, 1, 3, 4, 5, 6]`、徽标显示「第 3 列 / 第 9 列」、按钮文案 `展开剩余 4 个字段的类型卡片（还有 4 个未展开）`，展开后共 12 张、顺序 `[2, 8, 0, …, 11]`，统计仍是「数值 12 列 … 2 个存在类型不一致候选（共 2 处）」。

### 已知问题

1. 隐藏标签页（0×0 视口）下无法验证平滑滚动的观感，也无法出 375 / 1280 / 1440 px 的排版截图，只能确认「只调用一次容器 `scrollTo`」。
2. 定位状态下手动翻页时，如果目标列当时不在横向视野内，定位 effect 会因 `currentPage` 变化再补一次容器内 `scrollTo`（只滚表格容器，不动整页）；真实视口下两列表格不需要横向滚动，一般不会触发。
3. 每页固定 50 条，暂未做成可调。
4. 上传路径的自动化只能靠拖放事件驱动（本环境合成 `change` 触发不了 React handler），人工点「上传我的 CSV」选文件未覆盖。

### 是否需要人工验收

需要：① 真实视口下点冲突候选的观感（是否仍有页面跳动）；② 系统开启「减少动态效果」后 `auto` 定位的实际表现；③ 375 / 1280 / 1440 px 下分页条与类型卡片首屏排版；④ 每页 50 条是否合适，是否需要「每页 N 条」下拉；⑤ 冲突字段优先的排序是否需要给一个「按原始列序」开关。

### 下一步（未开工，等你确认）

本轮整改到此停止，未提交 Git、未发布站点。ECharts 图表、IQR 异常值、报告导出按约定仍未开发。

---

## Day 4 最后 UI 补丁（2026-11-17）：定位高亮被奇偶底色压掉 + 手动翻页后的旧定位提示

### 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/components/DataPreview.tsx` | 表头与数据行的底色/文字色改成整组互斥切换；`goToPage` 剥掉过期的行定位状态 |
| `src/components/DataPreview.test.tsx` | 新增 12 项用例 + 一套「真实级联」测试脚手架（注入 Tailwind 实际生成的背景规则后用 `getComputedStyle` 判定） |

CSV 解析与质量分析算法未改动，没有新增依赖，ECharts 未开工。

### 缺陷 1 的根因（比预想的更广：表头同样中招）

Tailwind v4 把 `odd:bg-white` / `even:bg-slate-50/60` 编译成 `.odd\:bg-white:nth-child(odd)`，特异性是 (0,2,0)，**天然高于**普通 `.bg-amber-50` 的 (0,1,0)；而同一族里 `.bg-slate-100` / `.text-slate-700` 在构建产物里又排在 `.bg-amber-100` / `.text-amber-900` **之后**（`dist/assets/index-*.css` 实测顺序：amber-50 → amber-100 → slate-50 → slate-100）。所以旧写法「基础类 + 追加高亮类」在两种情况下都会输：

- 定位行落在 odd 位 → 实际显示 `#ffffff`；落在 even 位 → 实际显示 `#f8fafc99`，琥珀色被吃掉；
- 定位列表头 → 实际仍是 `bg-slate-100 text-slate-700`，高亮和文字色一起失效。

修法不是提高优先级或加 `!important`，而是**让冲突的两组规则不再同时挂在同一个元素上**：`rowZebra` / `rowFocused` 二选一，`headerCellIdle` / `headerCellFocused` 二选一（底色与文字色成组切换，避免只换一半）。普通行照旧保留交替条纹，序号列 `#` 表头恒定 `bg-slate-100`（sticky 需要它不透明）。

### 缺陷 2 的修法

`goToPage`（「返回第一页」「上一页」「下一页」共用）把手动翻页视为行定位失效：只剥掉 `focusTarget.rowIndex`，保留 `columnIndex`——列在每一页都成立，行不然。于是提示条自动退化成「已定位到第 N 列「xxx」」，不再谎称「第 M 个数据行（第 P 页）」，当前页也不会残留琥珀色行。`handleFocusColumn`（冲突候选点击路径）未改，仍照常设置目标页码并保留行/列高亮；剥掉 `rowIndex` 后 `focusTarget` 与候选目标不再相等，所以「翻页后重点同一候选」是重新定位而不是意外取消。

### 测试：不只看类名，看级联结果

新增脚手架把 Tailwind 实际生成的背景规则（含先后顺序与 `:nth-child` 变体）注入 `document.head`，再用 `getComputedStyle(...).backgroundColor` 断言最终色值，并另设 `backgroundClasses()` 断言「同一元素不会同时声明高亮色与奇偶/基础色」。为确认这些用例是**真能抓 bug** 的，做了反向验证：

| 临时改回的写法 | 失败用例数 |
| --- | --- |
| 定位行追加 `odd:bg-white even:bg-slate-50/60` | 4 红（odd 位、even 位、整页互斥检查、翻页后重点候选） |
| 表头追加 `bg-amber-100 text-amber-900` + `goToPage` 不清行定位 | 6 红（表头级联、整页互斥、上一页/返回第一页/下一页提示、重点候选） |

12 项新用例：底色级联 6 项（odd 位、even 位、邻居仍条纹、表头不被压、定位单元格与行底色不冲突、整页 50 行逐行互斥）+ 翻页状态 6 项（上一页、返回第一页、下一页、列定位跨前后翻页保留、重点候选恢复行定位、翻页后「取消定位」一次清空）。Day 4 原有的第 2,000 行、第 50,000 行定位用例与 50 行分页用例全部保持通过，未放宽任何断言。

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（26 个文件，116 条规则，20 ms） |
| `npm test` | `Test Files 9 passed (9)` / `Tests 220 passed (220)`，6.54 s（DataPreview 34 → 46，本轮新增 12；csv 69 + columnTypes 34 + dataQuality 31 + display 9 + DataQualityPanel 14 + App 9 + CsvUploadPanel 4 + format 4） |
| `npm run build` | `tsc -b && vite build` 成功，29 个模块；`index.html 0.69 kB`、`CSS 23.33 kB (gzip 5.47)`、`JS 297.18 kB (gzip 95.07)`，176 ms |

### 浏览器验证（dev 5173，真实 Chromium 计算值）

夹具：200 行 × 2 列，`height_cm` 只在第 199 个数据行填「待复核」→ 目标落在第 4 页、`tbody` 第 49 个子元素（odd 位，正是旧写法会翻车的位次）。用 `File` + `change` 事件走既有解析路径。

| 检查点 | 实测 |
| --- | --- |
| 点候选后的定位 | `page-summary`「第 4 / 4 页，本页显示第 151–200 条」；DOM 内 `<tbody tr>` 仍 50 行；`tr[data-row-anchor="198"]` className 仅 `bg-amber-50`，computed `oklch(0.987 0.022 95.277)` |
| 邻居条纹 | 197/199 行 className 仍是 `odd:bg-white even:bg-slate-50/60`，computed `oklab(0.984 … / 0.6)`（两者都是 even 位） |
| 表头 | `th[data-column-anchor="1"]` computed bg `oklch(0.962 0.059 95.617)` + color `oklch(0.414 0.112 45.904)`；序号 `#` 表头 computed `bg-slate-100` 保持不透明 |
| 单元格 | 定位列 td computed `oklch(0.987 0.022 95.277)`；同行其它 td `rgba(0, 0, 0, 0)`，透出的是行上的琥珀色（无叠加冲突） |
| 提示条 | 「已定位到第 2 列「height_cm」，第 199 个数据行（第 4 页）」 |
| 手动翻页 | 上一页→第 3 页 / 返回第一页→第 1 页 / 下一页→第 2 页：提示只剩「已定位到第 2 列「height_cm」」，`tbody tr.bg-amber-50` 数量 0，表头仍为 amber-100（列定位成立） |
| 翻页后重点同一候选 | 回到第 4 页（首行 anchor 150），目标行 computed 琥珀色，提示恢复完整；再点一次 → 提示与高亮一次清空，表头回 `bg-slate-100` |
| 定位滚动（走 `auto` 分支） | `scrollTop` 0 → 1492（= `scrollHeight 1891 − clientHeight 399` 上限），目标行完整落在可视区内；容器内滚动，整页位置不动 |
| 375 px 窄屏（容器约束近似） | `documentElement.scrollWidth = 375`（无页面级横向溢出）；`table-scroll` clientWidth 284 < scrollWidth 448，横向滚动被关在容器内且滑动提示出现；统计卡 2 列、类型卡 1 列、分页按钮 96/68/68 px 且末页「下一页」`disabled` |

### 已知问题

- 内置浏览器里 `scrollTo({behavior:'smooth'})` 是**空操作**：隔离探针实测 `smooth` 后 `scrollTop = 0`、`auto` 后 `= 300`，与本应用代码无关。因此平滑滚动的观感只能在真实 Chrome/Edge/Safari 里人工确认；上面的定位滚动是用 `auto` 分支实测的。
- 内置浏览器的 `take_snapshot` / `take_screenshot` 本次均返回 `No browser tooling is available`，没有像素截图，全部结论来自 `evaluate_script` 读回的 computed style / 几何值；375 px 那条仍是容器宽度约束的近似（视口为 0×0 时 `sm:` 断点不生效），不等价于真实手机布局。
- `DataQualityPanel` 底部「判定口径说明」仍写着「跨行定位与高亮在后续版本提供，本期只给数据行序号文本」——该能力已在 Day 4 落地，文案已过时。本轮按「只实现明确要求的功能」没有动它，等你确认后再改。
- 定位行与定位列交叉的单元格目前与行同色（都是 `bg-amber-50`），交叉点没有更强的描边；要更醒目需要另一档色，属于视觉取舍，未擅自加。

### 是否需要人工验收

需要：① 真实浏览器（非内置）里平滑滚动到目标行的观感；② 真机 375 / 1280 / 1440 px 下分页条、类型卡片与定位提示条的排版（本轮无像素截图）；③ 手动翻页后「只保留列定位、清掉行定位」这个取舍是否符合预期（另一种做法是连列定位一起清空）；④ 定位行列交叉点是否需要更强的高亮；⑤ `DataQualityPanel` 那句过时文案是否本轮一并订正。

### 下一步（未开工，等你确认）

Day 4 的 UI 补丁到此停止，本轮未提交 Git、未推送远程、未发布站点。ECharts 图表、IQR/Z-score 异常值、报告导出按约定仍未开发。

---


## Day 1（2026-11-16）：项目初始化 + CSV 读取与预览

### 新增功能

1. **工程骨架**：React 19 + TypeScript 7 + Vite 8 + Tailwind CSS 4 + Papa Parse 5 + Vitest 5，纯前端架构。
   `tsc -b` 分成三个 project 分别检查浏览器代码、测试代码和构建脚本。
2. **首页**：品牌栏（FigureGuard / 科研图表急救室）、价值主张三张卡片、CSV 上传区、示例数据按钮、页脚说明。
   当前没有任何未实现功能的入口按钮。
3. **CSV 解析模块** `src/lib/csv.ts`：
   - `parseCsvText`：以 `header: true` + `skipEmptyLines: 'greedy'` 调用 Papa Parse，输出列名、按列对齐的行数据、真实记录数/字段数/UTF-8 字节数和原始告警
   - `readCsvFile`：扩展名校验 → 5 MB 上限校验 → `file.text()` 读取 → 解析
   - `loadExampleCsv`：读取 `public/examples/plant-growth.csv`
   - 错误分类：`empty-file`、`no-header`、`not-a-csv`、`file-too-large`、`read-failed`、`parse-failed`
4. **示例数据**：12 条合成植物生长记录（`sample_id`/`date`/`group`/`height_cm`），含 2 处空值、1 个离群大值 88.6、1 个负值 -4.2。界面明确标注为合成演示数据。
5. **数据预览组件**：统计卡片（记录数/字段数/体积/来源）、Papa Parse 告警列表（含换算后的文件行号）、可滚动表格、超过 50 行时的「展开全部记录」、空值与缺列的区分显示。
6. **文档**：`README.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/ACCEPTANCE.md`、`docs/PROGRESS.md`。

### 修复的问题

1. **Papa Parse 空表头改名导致误判**：`,,` 这类无字段名的首行会被 Papa 重命名为 `_1`、`_2`，最初用 `meta.fields` 判断「有没有表头」失效，返回了解析成功。改为检查原始首行文本（`hasHeaderNames`），现在正确返回 `no-header`。
2. **空单元格与缺列混淆**：初版测试假设 Papa 会把空单元格填成 `null`，实测是 `''`。修正为：`''` = 源文件里就是空值，`null` = 该行字段数少于表头，界面用「—」只显示后者并附说明。
3. **测试文件被生产类型检查拒绝**：测试需要 `node:fs`，而 `tsconfig.app.json` 只允许浏览器类型。新增 `tsconfig.test.json` 并把 `src/**/*.test.ts` 从 app project 排除。
4. **`tsconfig.test.json` 继承 app 的 exclude 导致 TS18003**（无输入文件）：显式覆盖 `"exclude": []`。
5. **清理 Vite 模板演示残留**：删除未被引用的 `src/App.css`、`src/assets/*`、`public/icons.svg` 和空目录 `src/assets/`。

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（12 个文件，116 条规则） |
| `npm test` | `Test Files 1 passed (1)`，`Tests 14 passed (14)`，耗时约 0.34 s |
| `npm run build` | `tsc -b && vite build` 成功，24 个模块，`index.html 0.69 kB`、`CSS 19.60 kB (gzip 4.66)`、`JS 252.00 kB (gzip 80.26)`，176 ms |
| `npm run preview`（端口 4173） | 首页与 `/examples/plant-growth.csv` 均返回 200，生产包点击示例数据得到 12 行 / 4 列 / 395 B |

浏览器实测（Vite 开发服务器端口 5199 + 生产预览 4173，DOM 级验证）：

- 示例数据：12 行 / 4 列 / 395 B / 来源「内置示例」，PG-004、PG-007 的空值原样显示，合成数据声明可见
- `lab-notes.csv`（60 行）：默认显示 50 行，展开后 60 行，来源「本地文件」
- `ragged.csv`（行长不一致）：2 条告警并指出文件第 3、4 行，缺列显示「—」
- 5,237,789 B（< 5 MiB）：正常解析 260,000 行；5,600,000 B：返回 `file-too-large`
- 0 字节文件：返回 `empty-file`；`notes.txt`：返回 `not-a-csv`
- 控制台无 error / warning

### Qoder Sites 部署

- 首次部署完成：`prepare_site`（`webDirectory: dist`）→ 草稿 ready 且无 blocker → `publish_site` → 状态 `published: true`、Operation `succeeded / committed: true`
- 站点地址：`https://figureguard-3g6uvbn5duq.qoder.zone`
- 本地描述文件：`.FigureGuard 科研图表急救室.qoder.site`（由工具生成，勿手工编辑）
- **访问控制**：发布时为 private（匿名 `curl` 返回 `401 sites_gateway_login_required`）；整改复核时 `get_publish_status` 与 `get_site_access` 显示已切换为 **public**（`auth_integration_status: not_required`，公开模式 `requires_confirmation: true`），匿名请求首页、示例 CSV 与 JS 资源均返回 200。切换不是本次操作，权限未被改动
- 本次未执行任何 Git 提交或推送（工作区仍有未跟踪文件）

### 已知问题 / 待办

- [ ] 视觉与响应式效果需在真实浏览器人工确认（自动化浏览器无可视视口，只能验证 DOM 结构与行为）
- [ ] 大文件（几十万行）目前一次性读入内存并全量持有行数组，后续若放开上限需改成流式/分片
- [ ] 尚未做列类型推断（数值/日期/分类），Day 2 的数据质量检测需要它
- [ ] 未支持 `.xlsx`、拖拽多文件、CRLF 与带引号跨行字段的行号换算尚未用例覆盖
- [ ] 单测目前只覆盖解析层，组件层测试（React Testing Library）还没引入，等交互稳定后再加
- [ ] Git 仓库已初始化且有远程 `origin`，但 Day 1 产物仍是未跟踪状态，等待你决定是否提交

### 下一步（Day 2 计划）

1. 增加列类型推断模块（数值 / 日期 / 分类 / 文本）及其单元测试
2. 实现 F2 数据质量检测：空值率、重复行、类型不一致、分隔符异常，输出可定位到行列的问题列表
3. 预览页新增「质检结果」面板，保持「结论必须能追溯到具体行列」的约束

---

## Day 1 代码审查整改（2026-11-16 晚）

针对代码审查结果做专项整改，未触碰 CSV 解析算法，未提前开发质检/图表/AI 功能。

### P0 粘性表头与数据行文字重叠

**根因（已量化确认）**：`border-collapse` 模式下浏览器不把 `<tr>` 的背景带到粘性 `<th>` 上，而当时的 `th` 自身没有任何背景（实测 `backgroundColor: rgba(0, 0, 0, 0)`）、`z-index: auto`、滚动容器 `isolation: auto`。滚动时表头带内仍有 2 行数据（实测数据行文字如 `L005` 落在表头区间内），这些行没有被不透明层遮挡，于是与表头文字叠在一起。

**修改**（`src/components/DataPreview.tsx`）：

- `table` 改为 `border-separate border-spacing-0`
- 每个 `th` 自带 `sticky top-0 z-20 bg-slate-100 border-b border-slate-300`（不透明背景 + 明确层叠顺序）
- 滚动容器加 `isolate`，把 `z-20` 限制在容器内，避免表头盖住页面吸顶导航（`AppHeader` 为 `z-10`）
- 行间分隔线从 `tr` 的 `border-t` 移到 `td` 的 `border-b`（`border-separate` 下 `tr` 的边框不渲染），斑马纹背景保留
- 加 `data-testid="table-scroll"` 供自动化定位

**验证**：`borderCollapse: separate`、`borderSpacing: 0px`、`thBackgroundColor: oklch(0.968 0.007 247.896)`（不透明）、`thZIndex: 20`、`containerIsolation: isolate`；滚动到顶部/中部（scrollTop 60、200）/底部时表头相对容器偏移恒为 1px（容器 1px 边框），表头带内依然存在数据行但被完全遮挡；横向滚动仍生效（`scrollWidth > clientWidth`）。

### P1 展开全部记录改为分批显示

**根因**：`showAllRows ? table.rows : rows.slice(0, 50)` 会一次性挂载全部行（实测 239,153 行的文件会渲染 23 万+ 个 `<tr>`）。

**修改**：`renderedRowCount` 状态（初值 50），按钮每次 `+50` 并显示「还有 N 行未显示」；`Math.min(renderedRowCount, recordCount)` 兜住越界；用 `sourceTable !== table` 的派生重置模式，切换数据集时自动回到首批 50 行（避免沿用上一份文件的展开状态）。

**验证**：4.58 MB / 239,153 行文件初始渲染 50 行，点 1 次 → 100 行，点 2 次 → 200 行，「展开全部记录」按钮已不存在；文案同时保留总记录数与当前显示条数。

### P1 异步异常兜底

**根因**：`App.parseTask` 只有 `try/finally`，任务内任何未被局部捕获的异常都会变成 unhandled rejection，界面停在空白；`loadExampleCsv` 的 `response.text()` 没有保护（网络响应体中断即会抛出）。

**修改**：`App.parseTask` 增加 `catch`，转换为 `{ status: 'error', error: { code: 'parse-failed', message } }` 交给现有 `ParseErrorPanel`；`loadExampleCsv` 的 `response.text()` 包上 `try/catch` → `read-failed`；`ParseErrorPanel` 的 `read-failed` / `parse-failed` 提示文案改为与这两条真实路径匹配。错误均如实上报，没有吞掉异常或伪造成功。

**验证**：stub `fetch` 使响应体 `text()` 拒绝 → 面板显示「内置示例数据读取响应体失败：…」（`read-failed`）；派发带异常 `name` getter 的伪文件 drop 事件 → 面板显示「解析过程中出现未预期的异常：…」（`parse-failed`）；两轮操作后控制台只剩 Vite HMR 调试日志，无 error、无 Unhandled promise rejection。

### P1 空值显示区分

**保持数据结构不变**（`''` 与 `null` 语义照旧），仅改渲染：`''` → 虚线边框的「空值」标签，`null` → 实线灰底的「—」，并按当前可见行分别显示图例说明。

**验证**：`nullish.csv`（`A,10,` / `B,,ok` / `C,3`）渲染为 `[空值]`、`[空值]`、`[—]`，两条图例同时出现。

### 回归检查（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | 0 warnings / 0 errors（12 files） |
| `npm test` | 14 passed (14)，解析算法未改动，无需新增算法用例 |
| `npm run build` | 成功：CSS 20.23 kB（gzip 4.76）、JS 253.41 kB（gzip 80.66），163 ms |

### 本次仍未完成

- 修复前后**像素截图**：自动化浏览器无可视视口（`viewport=0x0`、`visibilityState=hidden`），`take_screenshot` 与 `elementFromPoint` 命中测试均不可用。改为提交「计算样式 + 几何位置」量化证据（见上）；需要像素图时请在 Qoder 里打开内置浏览器面板后复跑
- 窄屏（375 px）真实断点表现仍需人工确认，本次只验证了横向滚动可用与类名/规则存在
- 站点访问权限保持现状（public），未做任何改动；如需回私有或改「指定人」，需要你明确授权
- 整改后的 `dist/` 尚未重新发布到 Qoder Sites（需要发布授权）

---

## 第一轮 UI / UX 优化（2026-11-16 晚）

目标是「小范围高质量打磨」：只动首页结构、文案、上传交互与表格排版，未改 CSV 解析算法与 `CsvTable` 数据结构，未新增业务模块，未引入任何依赖，未提交 Git、未发布站点。

### 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/App.tsx` | 页面顺序改为 导航 → 核心价值 → 主操作入口 → 数据预览 → 辅助介绍；解析成功后把结果区滚动进视野（`prefers-reduced-motion` 时不做平滑滚动） |
| `src/components/HeroPanel.tsx` | 换成新主标题与副标题，删掉首屏里的三张价值卡片（不再挤占主操作入口的位置） |
| `src/components/CsvUploadPanel.tsx` | 拖拽处理从按钮移到整块区域；拖拽悬停高亮与标题反馈；解析中状态（`role="status"` + CSS 加载圈 + 按钮禁用）；主次按钮改为「体验示例数据 / 上传我的 CSV」；新增辅助说明文案 |
| `src/components/ProductNotes.tsx` | 新增：价值卡片 + 「当前版本范围」声明，移到结果区之后作为辅助介绍 |
| `src/components/DataPreview.tsx` | 数值列右对齐 + 等宽数字、日期列等宽、行高与列距微调、长文件名与长单元格省略号、统计数字千分位；保留分批渲染与真实统计 |
| `src/components/ParseErrorPanel.tsx` | 圆角与按钮样式统一，错误文案允许断词，避免长文件名撑破面板 |
| `src/components/AppHeader.tsx` | 品牌标记复用 `favicon.svg`，文字加 `min-w-0 truncate` |
| `src/lib/display.ts` | 新增：仅用于排版的列视觉分类（`number` / `date` / `text`）与对齐映射 |
| `src/lib/display.test.ts` | 新增 9 条用例（含对内置示例数据四列的实际判定） |
| `src/lib/format.ts` / `format.test.ts` | 新增 `formatCount` 千分位；补 4 条格式化用例 |
| `src/index.css` | 新增 `--color-brand-ring`、键盘 `:focus-visible` 描边、`prefers-reduced-motion` 下关闭动画与平滑滚动 |
| `public/favicon.svg` | 替换 Vite 模板的紫色闪电，改为品牌青绿（`#0d9488`）的原创柱状图标记 |
| `README.md` / `docs/ARCHITECTURE.md` | 同步交互说明、目录结构与「对齐只做排版」的约定 |

### 设计调整前后

| 位置 | 调整前 | 调整后 |
| --- | | --- |
| 首屏顺序 | 导航 → 主标题 → 介绍段 → **三张价值卡片** → 上传区 → 结果 | 导航 → 主标题 + 副标题 → **上传/示例操作区** → 结果 → 价值卡片（辅助介绍） |
| 主标题 | 「给科研图表做一次完整体检」（暗示已支持图表诊断） | 「实验数据，先看清，再分析。」 |
| 按钮层级 | 主按钮是「选择 CSV 文件」，示例按钮是次级描边 | 主按钮「体验示例数据」（品牌色实底），次按钮「上传我的 CSV」（描边） |
| 拖拽热区 | 只有「选择 CSV 文件」按钮接收 drop | 整块虚线区域接收 drop，且点击进入文件选择；`dragleave` 用 `relatedTarget` 过滤，经过子元素不闪烁 |
| 解析中 | 仅一行「正在解析……」文字 | `role="status"` + `aria-live="polite"` 文案「正在浏览器本地解析……」+ CSS 加载圈 + 两个按钮禁用 + 区域不再响应点击 |
| 结果可见性 | 解析后页面不动，需手动下滚 | 解析成功后结果区滚入视野（`scroll-mt-24` 避开吸顶导航；系统开启减少动态效果时改为直接定位） |
| 表格排版 | 全部左对齐；长文件名与超长单元格可能撑破布局 | `#` 与数值列右对齐 + `tabular-nums`，日期列 `tabular-nums` 左对齐，长单元格 / 长文件名省略号 + `title` 全文 |
| 标签页图标 | Vite 模板紫色闪电（`#863bff`），与品牌色冲突 | 品牌青绿圆角方块 + 白色递增柱状图，导航栏复用同一图形 |

### 实测结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（16 个文件，116 条规则） |
| `npm test` | `Test Files 3 passed (3)`，`Tests 27 passed (27)`（解析 14 + 排版分类 9 + 格式化 4），耗时约 0.41 s |
| `npm run build` | `tsc -b && vite build` 成功，26 个模块；`index.html 0.69 kB`、`CSS 20.50 kB (gzip 5.02)`、`JS 256.50 kB (gzip 81.79)`，139 ms |

浏览器行为验证（`http://localhost:5200` 开发服务器，DOM + 计算样式测量）：

- DOM 顺序：`SECTION(实验数据，先看清，再分析。)` → `SECTION(上传实验数据 CSV)` → `DIV(数据预览)` → `SECTION(为什么先做「看清数据」这一步)`；全页只有 `体验示例数据 / 上传我的 CSV / 清除结果（+ 分批按钮）` 四种真实按钮
- 整块区域 drop：向区域 `div` 派发 `drop`（74 B 的 CSV）→ 解析成功，统计为 4 行 / 3 列 / 74 B / 本地文件，未触碰任何按钮
- 拖拽反馈：`dragenter` 后容器切到 `border-brand bg-brand-soft`、标题变「松开即可解析这个文件」；`relatedTarget` 指向区域内子元素的 `dragleave` 不清除高亮（无闪烁）；真正离开后恢复
- 解析中状态：把 `file.text()` 延迟 400 ms 后，`[role="status"]` 文案出现、加载圈 `animation-name: spin`、两个按钮 `disabled = [true, true]`、旧预览清空；结束后自动恢复
- 滚动定位：成功解析后调用 `scrollIntoView({ behavior: 'smooth', block: 'start' })`；stub `matchMedia` 命中 `prefers-reduced-motion: reduce` 后为 `{ behavior: 'auto', block: 'start' }`
- 点击语义：点击区域空白 → `input.click()` 计数 +1；点击「上传我的 CSV」→ 计数 +1（不会二次触发）；解析中点击区域 → 计数不变
- 列对齐（真实计算）：示例数据 `#`=right/tabular、`sample_id`=left、`date`=left/tabular、`group`=left、`height_cm`=right/tabular；自造数据 `value` 列（`10`/``/`7.5`）同样判为数值列右对齐，且 `空值` 与 `—` 分别正确出现
- 分批显示未回退：60 行文件初始 50 行 + 「再显示 10 行（还有 10 行未显示）」，点一次后 60 行并显示「已显示全部记录。」
- 长文件名：`p[title]` 的 `overflow-x: hidden`、`text-overflow: ellipsis`、`white-space: nowrap` 生效，完整名称保留在 `title`
- 上一轮的粘性表头修复未被破坏：`border-collapse: separate`、`border-spacing: 0px`、`th` 背景不透明、`th z-index: 20`、容器 `isolation: isolate`
- 图标：`/favicon.svg` 作为标签页图标与导航标记均加载成功（`naturalWidth/Height = 32`）
- 控制台：仅 Vite 连接日志与 React DevTools 提示，无 error / warning
- 构建产物 CSS 规则抽查：`lg:flex-col`、`sm:grid-cols-3`、`max-w-[24rem]`、`min-w-16`、`scroll-mt-24`、`even:bg-slate-50/60` 等已真实生成（顺带发现 Tailwind v4 已移除裸 `rounded`，原「空值 / —」标签的圆角实际无效，本次改为 `rounded-sm`）
- 全局可访问性样式已进生产包：`:focus-visible{outline:2px solid var(--color-brand);outline-offset:2px}` 与 `@media (prefers-reduced-motion:reduce){*,:before,:after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}`

### 仍需人工确认

- **1440 / 1280 / 375 px 的真实渲染与像素截图**：内置浏览器面板仍然报 `viewport=0x0 / visible=false`，`take_screenshot` 与 `click` 不可用，本次全部是 DOM 结构与计算样式证据，没有像素图。需要你打开内置浏览器面板（或真实浏览器）确认：首屏是否能直接看到「体验示例数据」、375 px 下按钮与卡片堆叠、表格横向滚动与吸顶表现
- 拖拽的真实系统级反馈（鼠标光标、`cursor: copy` 之类）只能靠人工拖文件验证；本次用合成 `DragEvent` 验证了状态机
- 点击整块区域即打开文件选择框，是否符合你的预期（也可以改回只有按钮触发）
- `dist/` 已重新构建但**未发布**到 Qoder Sites；线上仍是上一轮版本，需要发布授权

---

## Day 2（2026-11-17）：CSV 边界处理 + 错误交互 + 测试与稳定性

范围严格限定在 CSV 导入模块：未实现数据质检引擎、未引入 ECharts 图表、未开发 AI 功能、未重排首页、未做无关重构；未提交 Git、未发布站点。

### 任务一：CSV 边界处理（10 类，全部按 Papa Parse 真实行为设计）

| 边界情况 | 处理方式 | 依据（实测） |
| --- | --- | --- |
| UTF-8 BOM | Papa 已在输入层剥离，首列名不带 BOM；字节数按含 BOM 的原文算；只有 BOM / BOM+空白仍判 `empty-file` | `meta.fields[0]` 干净，`TextEncoder` 计字节 |
| 纯 CRLF | 正常解析，单元格不留 `\r` | Papa 用首个 `meta.linebreak` 切分 |
| LF/CRLF 混用 | 数据保持原样（最后一个单元格留 `\r`），追加 `error` 级派生提示 `MixedLineEndings` 并给物理行号 | 按首 LF 切分时 `\r` 必然留在字段里 |
| 引号内含逗号 | 不拆列，无提示 | `meta.fields` 长度不变 |
| 引号内含换行 | 一个单元格保留 `\n`，记录数不变；后续错位行的**物理行号**用字符偏移换算 | `"x\ny",1,2` 的错位记录在文件第 5 行，`rowIndex+2` 会算成第 3 行 |
| 重复表头 | 按 Papa 的 `name → name_1` 结果读取，并给 `notice` 提示说明改名前后 | `meta.renamedHeaders` |
| 空表头 | 全空 → `no-header`；部分空 → 正常解析 + 逐列 `EmptyHeaderColumn` 提示（第 N 列未命名） | Papa 把空列名改成 `_1`，所以判断必须反推原始名 |
| 行长不一致 | 缺列补 `null`（显示「—」），多出的字段进 `__parsed_extra` 并被丢弃（不新增列）；两个方向各出一条 `TooFew/TooManyFields`，带 `expected/parsed` 原文 | 与 `recordCount`/`columnCount` 自洽 |
| 只有表头 | `recordCount = 0` 成功返回，界面提示「识别到 N 个字段名，但文件里没有数据行」 | 不报错 |
| 单列 CSV | 正常解析；Papa 的 `UndetectableDelimiter` 从隐式告警降为 `notice`（说明退回默认逗号） | 单列时该告警必然出现 |
| 不支持格式 | 首字符 U+FFFD 或前 4096 字符含 NUL → 新错误码 `unsupported-encoding`；`.xlsx/.xls/.ods/.numbers/.et` 与 `.tsv/.tab` 各有针对性文案（另存为 CSV UTF-8 / 分隔符已自动识别） | UTF-16/二进制按 UTF-8 读会产出替换符与 NUL |

配套改动：`CsvIssue` 增加 `message`（中文）/`rawMessage`（英文原文）/`fileLine`/`fileEndLine`/`severity`/`origin`，`CsvTable` 增加 `delimiter`；`DataPreview` 的问题面板改为「X 条需要处理的格式问题、Y 条说明性提示」并显示 `[文件第 N–M 行]` 与 `Papa Parse 原文：…`，脚注解释物理行号口径。

行号换算：仅在确实存在需要行号的错误时，用同一 `delimiter`/`linebreak` 再跑一次 `header:false` + `step` 的解析收集 `meta.cursor`，到需要的最后一条记录就 `abort()`，再用换行偏移表二分 + 减去记录内嵌换行数。实测 26 万行错位文件整趟 183 ms，干净文件不触发额外解析。

### 任务二：错误与结果可见性交互

- 结果面板 `div` 常驻（`ref` + `scroll-mt-24`），成功与失败都定位；`resultToken` 保证一次解析只滚一次，面板顶部已在视口上半部（`0 ≤ top ≤ innerHeight×0.5`）时完全不滚
- `prefers-reduced-motion: reduce` 时用 `behavior:'auto'`，否则 `'smooth'`
- 失败：`ParseErrorPanel` 为 `role="alert"` + `aria-labelledby/aria-describedby`，含中文原因、下一步建议与 `错误代码：xxx`
- 成功：常驻 `sr-only role="status" aria-live="polite"` 播报「解析完成：N 行 M 列，…格式问题/说明提示」，读屏不依赖视觉位置
- 既有解析流程（`parseTask` 的 try/catch/finally、示例与本地两条入口）未改动语义

### 任务三：测试（保留原 27 项，新增 66 项，共 93 项）

- `src/lib/csv.test.ts`：14 → 55 项。新增 BOM/CRLF/混用换行/NUL/替换符、引号内逗号与换行、跨行记录后的物理行号（含起止行）、未闭合引号定位、重复与空表头、只有表头、单列降级、分号分隔符、`readCsvFile` 体积/超限/读取失败、`loadExampleCsv` 的 404 与响应体中断、内置示例数据 12 行 4 列含空值、同文本重复解析结果一致与 `rows/columns` 自洽
- `src/components/CsvUploadPanel.test.tsx`（新，jsdom）：4 项 —— 文件选择与重复选择、整块拖拽 + `relatedTarget` 不闪烁 + drop 取文件、解析中禁用与 `role="status"`、点击空白只打开一次文件框
- `src/components/DataPreview.test.tsx`（新，jsdom）：12 项 —— 表头与未命名列标签、只有表头、空值/缺列图例、50 行分批与「还有 N 行未显示」、换数据集回到首批、提示条数与物理行号区间、`Papa Parse 原文`、单列只说明、结构一致只给结论、粘性表头的不透明背景/`isolate`、清除结果回调、示例数据来源说明
- `src/App.test.tsx`（新，jsdom）：9 项 —— 成功滚动一次、面板已可见则不滚、减少动态效果用 `auto`、失败也滚动且 `role="alert"` + `错误代码`、编码错误、清除后再上传各滚一次、`sr-only` 播报文案、示例↔本地互不污染、示例 404 不留半截结果
- 没有为通过测试而修改既有预期；唯一的预期订正是我新写的用例数据本身写错（`'a,b,c\n1,2\n3,4,5'` 第三行字段数与表头相同，不构成 `TooManyFields`），改为 `3,4,5,6` 后确实是 2 条格式问题
- 配置：`vite.config.ts` include 增加 `src/**/*.test.tsx`；`tsconfig.test.json` include 增加 `.tsx`；`tsconfig.app.json` exclude 增加 `.test.tsx`；新增 devDependencies `jsdom`、`@testing-library/react`、`@testing-library/dom`（未引入 jest-dom，断言只用 DOM 结构与文本）

### 任务四：稳定性检查（开发服务器 5174，真实 Blink 布局 + 同尺寸 iframe）

| 项目 | 实测结果 |
| --- | --- |
| 重复上传同一 CSV ×6 | 6 次快照（表头/行数/首末行/统计卡/提示）完全一致；DOM 内始终只有 1 个结果容器、1 个「数据预览」；`scrollIntoView` 恰好 6 次且参数均为 `{behavior:'smooth',block:'start'}` |
| 示例 ↔ 本地来回切换 | 示例 12 行/4 列/395 B/内置示例 → 本地 `semi.csv` 1 行/2 列/15 B/本地文件 + 1 条说明性提示 → 再点示例，结果与第一次逐字段一致（Papa 改名状态无跨调用泄漏） |
| 清除结果后再次上传 | 「清除结果」后面板文本为空且无 `<table>`；再上传错位文件得到 2 行/3 列与 `[文件第 2 行]`、`[文件第 3–4 行]` 两条提示 |
| 大批量分批加载 | 1,200 行：初始 50 行 → 点一次 100 行 → 300 行；5,000 行/209.9 KB：`drop` 后约 100 ms 出结果，页脚「共解析 5,000 条记录，当前显示前 50 条。」 |
| 表头 sticky 无文字重叠 | `position:sticky`、`top:0`、`z-index:20`、背景 `oklch(0.968 0.007 247.896)`（不透明、无渐变）、`border-collapse:separate`、容器 `isolation:isolate` + `overflow:auto` + `max-height:416px`；`scrollTop` 0 → 240 → 1492 时表头相对容器恒为 1 px（边框），数据行确实滚入表头带内但被不透明层完全遮住 |
| 移动端横向溢出 | 375×900 iframe：`documentElement.scrollWidth 360 ≤ 375`，无页面级横向溢出，逐元素扫描 0 个越界；8 列宽表（`scrollWidth 1940`）被限制在 `overflow-x:auto` 容器内（clientWidth 269），页面宽度仍是 360 |
| 错误面板可访问性 | `role="alert"` 的 `aria-labelledby/aria-describedby` 指向 `useId` 生成的标题/描述，正文含「错误代码：empty-file」与重置按钮；`sr-only` 播报区 `aria-live="polite"` 常驻 |
| 控制台 | 仅 Vite 连接日志与重名表头时 Papa 自身的 `Duplicate headers found and renamed.` 警告（第三方内部行为，界面已解释），无未捕获异常 |

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（19 个文件，116 条规则） |
| `npm test` | `Test Files 6 passed (6)`，`Tests 93 passed (93)`，耗时 2.88 s（csv 55 + DataPreview 12 + App 9 + display 9 + CsvUploadPanel 4 + format 4） |
| `npm run build` | `tsc -b && vite build` 成功（exit 0），26 个模块；`index.html 0.69 kB`、`CSS 20.95 kB (gzip 5.10)`、`JS 263.50 kB (gzip 84.40)`，185 ms |

### 已知问题

- 内置浏览器仍无可视表面（`viewport=0x0`、`visible=false`，`take_screenshot` 直接报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`），本轮全部是 DOM/计算样式/几何与 iframe 布局证据，**没有像素截图**
- LF/CRLF 混用时 `\r` 仍留在单元格内（只提示不加工），后续质检若按数值解析需自行容忍
- 单次解析仍一次性持有全部行数组（5 MB 上限内），几十万行的内存占用未优化
- 存在错位行时会多跑一趟 `step` 解析换取真实行号（实测 26 万行 183 ms，属可接受成本）
- jsdom 无 `DragEvent`/`matchMedia`，组件测试需自建事件并用 `Object.defineProperty` 注入 `relatedTarget`；`fireEvent(el, { relatedTarget })` 在 jsdom 里拿不到值（已验证：只有 `defineProperty` 方式能传到 React 处理器）

### 是否需要人工验收

需要：① 1440/1280/375 px 的真实渲染与拖拽手感；② 读屏软件（NVDA/VoiceOver）对成功播报与失败 `role="alert"` 的实际朗读顺序；③ 是否接受「点击整块虚线区域即打开文件选择框」；④ 是否接受混用换行符时保留 `\r` 的口径。

### 下一步（Day 3，未开工）

列类型推断（数值/日期/分类/文本）→ F2 数据质量检测（空值率、重复行、类型不一致、分隔符异常），问题列表复用 Day 2 的物理行号口径；`docs/PRD.md` 的 Day 3 验收标准待你确认后再动。

---

## Day 2 代码审查整改（2026-11-17 凌晨）：`__parsed_extra` 表头误删 + 错误密集栈溢出 + 数据可信度状态

范围严格限定为独立浏览器测试发现的 2 个真实缺陷、1 个数据结构设计与 3 项轻量 UI 调整。未开工 Day 3（列类型推断、质检引擎），未做无关重构，未提交 Git，未发布站点。工作区改动为 6 个源文件（`git status --short`：`src/types/csv.ts`、`src/lib/csv.ts`、`src/lib/csv.test.ts`、`src/components/DataPreview.tsx`、`src/components/DataPreview.test.tsx`、`src/App.tsx`）+ 本轮文档，全部保留为未提交状态。

### P0：合法表头 `__parsed_extra` 被当成解析器内部键，整列被删

复现输入（真实浏览器拖拽，不是单元测试构造的边界数据）：

```csv
__parsed_extra,x
hello,world
```

修复前实测：表头只剩 `x`，`hello` 整列消失。

根因：`src/lib/csv.ts` 的 `normalizeColumns()` 把 Papa Parse 收集「多出来的字段」用的内部桶键 `__parsed_extra` 从 `meta.fields` 里过滤掉了。`meta.fields` 本身是**用户表头的真实内容**（Papa 只在行内字段数超过表头时才往 `row.__parsed_extra` 这个数组里塞值），所以一旦用户的列名恰好叫 `__parsed_extra`，这列的名字和数据会被一起当成解析器噪声删除——属于静默丢数据。

修复策略（不再过滤 `meta.fields`，改为区分「真实表头」与「解析器桶」）：

- `normalizeColumns()` 删除，改为 `columnsFromFields()`：`meta.fields` 原样拷贝，一列不删
- `cellOf(row, column)`：字符串值直接取；当列名正是 `__parsed_extra` 且该格是 Papa 的数组桶时，取 `value[0]`（数组第 0 项就是用户真正写在这一列的值），真实单元格得以保留
- `droppedValueCount(row, headerHasExtraColumn)`：只有「没有列名接收」的值才计入丢弃数量——表头里没有这一列时丢弃整段数组长度，表头有这一列时先扣掉属于表头的那 1 个值
- 新增 `notice` 级派生提示 `ParsedExtraHeaderCollision`，说明「表头里有一列的名字与 Papa Parse 收集多余字段的内部键同名」，把同名风险讲清楚但不动数据

浏览器复验（生产构建预览之外的开发服务器，真实 DOM 读取）：表头 `["#", "__parsed_extra", "x"]`、首行 `["1", "hello", "world"]`、统计卡 1 行 / 2 列 / 29 B / 本地文件、同名提示存在、控制台 0 error。

### P1：错误密集的 CSV 触发 `RangeError: Maximum call stack size exceeded`

复现输入：3 列表头 + 14 万条只有 2 个字段的记录（远小于 5 MiB）。修复前在 `collectIssues()` 里崩溃。

根因：`Math.max(...neededRows)` 把约 14 万个元素的数组**展开成函数实参**，超过 V8 的单次调用参数上限。同时旧实现会把每一条 Papa 错误都逐条换算物理行号并全部塞进 `issues`，界面再一次性渲染——即使不崩溃也是几万个 DOM 节点。

修复策略：

- `maxOf(values: Iterable<number>)`：循环求最大值，不做参数展开（栈溢出根因消除）
- `createIssueRecorder()`：按来源（`papaparse` / `figureguard`）各给 `MAX_ITEMIZED_ISSUES = 200` 条明细预算；预算内 `record()` 逐条入列，预算外只 `count()` 累加到 `issueGroups[].total`——**总条数与类型分布始终是全文件真实值，一条不少**
- 物理行号只对预算内的错误换算：`neededRows` 只收集前 200 条错误的 `row`，第二趟 `header:false + step` 解析在读到第 200 条后就 `parser.abort()`，不再为定位最后一行错误而扫完整份文件
- `issueTotals` 由各分组的 `total` 求和得到（不再依赖明细数组长度）；`App.tsx` 的 `sr-only` 播报同样改用 `issueTotals`，避免「5 万条问题播报成 200 条」
- 面板改为「总量 + 类型分布 + 逐批明细」：首屏 20 条明细，点「再显示 20 条错误明细（还有 N 条已列明细未展开）」递增，并明确写出「另有 49,800 条同类格式问题没有逐条列出（明细每种来源最多 200 条）；上面的总条数与类型分布按整份文件统计，没有少算。」——即不静默丢弃问题，只限制一次性进 DOM 的节点数

浏览器实测（5 万条缺列记录，`a,b,c` 表头 + `i,1` × 50,000）：

| 指标 | 实测 |
| --- | --- |
| drop → 结果可见 | 约 128 ms（修复前直接抛 `RangeError`） |
| 结果卡片 DOM 节点总数 | 549 个 |
| `<tbody tr>` | 50 行（未回退） |
| `[data-testid="issue-list"] li` | 20 条，点一次「再显示 20 条错误明细」→ 40 条 |
| 标题 | 「解析结果里有 50,000 条需要处理的格式问题、0 条说明性提示」 |
| 类型分布 | 「字段数少于表头（TooFewFields）：50,000 条，已列出 200 条」 |
| 折叠的英文原文 | `details` 20 个，`details[open]` 0 个 |

14 万行量级由 `src/lib/csv.test.ts` 的用例守住（断言 `recordCount = 140000`、`issueTotals.errors = 140000`、整文件耗时 < 8 s；实测该文件 69 项合计 310 ms）。

### P1：结构可信度状态（只设计数据结构，不做统计）

`CsvTable` 新增 `structure: CsvStructureStatus`：

```ts
state: 'sound' | 'degraded';
rowsWithMissingFields / rowsWithExtraFields / droppedExtraValues / renamedHeaderColumns: number;
mixedLineEndings: boolean;
reasons: string[];   // 中文，可直接展示
```

降级触发：有行字段数少于表头、有值因没有列名而被丢弃、换行符混用。表头重名只改名不丢数据，仍为 `sound`（`renamedHeaderColumns` 单独计数）。界面在问题面板顶部给琥珀色横幅「数据结构不完整，后续的数据质量分析不能把这份数据当作完全可信」+ `reasons` 列表；干净文件不出现横幅，只有绿色「Papa Parse 未报告格式错误，行列结构与表头一致。」。本轮**没有**实现任何统计/质检结论，只把「这份数据能不能信」变成可读取的状态字段。

### P2：轻量 UI 调整（未重排首页，沿用既有设计）

- 横向溢出提示：`ResizeObserver` + `scrollWidth - clientWidth > 1` 判定，只有真放不下时才出现「↔ 列宽超过屏幕，左右滑动可查看更多字段（本次共 N 列）。」；实测 633 px 视口下 8 列长表名文件 `scrollWidth 1874 / clientWidth 542` → 提示出现，4 列窄文件不出现
- Papa Parse 英文原文改放进默认折叠的 `<details>`（`summary` = 「Papa Parse 原文」），中文说明保持直接可读
- 问题面板按 `severity` 分组（`error` / `notice`），`issueGroups` 多于 1 组或有省略时才显示类型分布行

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（19 个文件，116 条规则，21 ms） |
| `npm test` | `Test Files 6 passed (6)`，`Tests 115 passed (115)`（csv 69 + DataPreview 20 + App 9 + display 9 + CsvUploadPanel 4 + format 4），3.75 s |
| `npm run build` | `tsc -b && vite build` 成功，26 个模块；`index.html 0.69 kB`、`CSS 21.85 kB (gzip 5.28)`、`JS 268.88 kB (gzip 86.36)`，174 ms |

新增 22 项测试（93 → 115），全部为真实行为断言：`__parsed_extra` 表头不丢列/不丢值 5 项、结构状态 4 项、错误密集开销与上限 5 项（含 14 万行栈溢出回归）、面板明细分页与折叠与滑动提示 8 项。没有为通过测试修改既有预期，Day 2 原有 93 项全部仍通过。

### 浏览器验证环境变化（重要）

本轮内置浏览器**首次有真实可视视口**（`window.innerWidth/innerHeight = 633×665`、`visibilityState = visible`），`take_screenshot` 可用并产出 2 张 PNG（窄屏横向滑动提示、5 万条错误面板）。因此 `docs/ACCEPTANCE.md` 第 5 节里「无法提供像素截图」这条限制已订正；但 1440 / 1280 / 375 px 的宽屏与手机宽度渲染仍未截图，仍需人工确认。

### 已知问题

- 明细每种来源上限 200 条：超出部分只在 `issueGroups` 里计数并明确告知，逐条明细需点「再显示」；如果以后要导出全部错误，需要另做流式/分页导出
- `structure.state` 目前只被界面消费，还没有任何分析模块读取它（Day 3 质检必须显式处理 `degraded`）
- 一次性持有全部行数组的内存模型没变（5 MiB 上限内）；5 万错误行解析约 128 ms，4.58 MB / 23.9 万行的干净文件仍需约 2 s
- 表头真叫 `__parsed_extra` 且该行字段数多于表头时，Papa 会把多出的值追加进同一个桶，只能保留第 1 个值并计入 `droppedExtraValues`（已有用例覆盖）
- 开发服务器（5174）验证后已退出；另有一个不属于本轮的 5200 端口监听进程仍在运行，未做处理

### 是否需要人工验收

需要：① 1440 / 1280 / 375 px 下错误面板与滑动提示的真实排版（本轮截图是 633 px）；② 读屏软件对「50,000 条格式问题」这类总量播报是否够用；③ 是否接受「明细上限 200 条 + 逐批 20 条展开」的口径；④ `degraded` 横幅的措辞是否需要更硬（例如禁止进入后续分析）。

### 下一步（Day 3，已完成，见下方 Day 3 章节）

Day 3 原计划（列类型推断 → F2 数据质量检测）继续，但质检引擎第一个输入应改为 `table.structure.state`：`degraded` 时必须显式声明数据可信度，不能把缺列/丢值的数据当作完整数据出统计结论。

## Day 3（2026-11-17）：数据质量诊断引擎 V1（准入判断 + 缺失值 + 疑似重复记录 + 质量概览 UI）

目标：在已通过验收的 CSV 解析层之上，做第一版**只读**的数据质量诊断。所有数字来自已解析单元格的逐格统计，不写死、不填充、不删除、不改写任何数据。

### 修改文件

新增：`src/types/dataQuality.ts`、`src/lib/dataQuality.ts`、`src/lib/dataQuality.test.ts`、`src/components/DataQualityPanel.tsx`、`src/components/DataQualityPanel.test.tsx`

修改：`src/lib/format.ts`（新增 `formatRate`）、`src/components/DataPreview.tsx`（挂载质量面板 + 示例数据声明补一句「本期没有做异常值判断」）、`src/components/DataPreview.test.tsx`（+3 集成用例与 `manyMissingColumnsCsv()` 夹具）、`src/components/ProductNotes.tsx` 与 `src/App.tsx` 页脚（范围声明改为「CSV 读取、数据预览与数据质量概览」）、`README.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/ACCEPTANCE.md`、`docs/PROGRESS.md`

未改动：`src/lib/csv.ts`、`src/types/csv.ts`、`src/lib/display.ts`、`src/components/CsvUploadPanel.tsx`、`src/components/ParseErrorPanel.tsx`（解析层与上传层保持验收时的原样，质量诊断只作为 `CsvTable` 的只读消费者接入）

### 任务 A：准入判断（补掉 Day 2 留的设计缺口）

Day 2 的 `structure.state` 只回答「行列跟不跟得上表头」。`a\n"foo` 这类文件正好戳穿它：引号未闭合让后面的内容整体错位，但字段数依然与表头一致，所以 `state` 仍是 `sound`——只按 `state` 判断就会把错位读进来的单元格当成可信输入去做统计。

`src/lib/dataQuality.ts` 的 `evaluateQualityAdmission(table)` 因此同时看两个**互相独立**的信号，任一成立即阻止正式结论：

| blocker `code` | 触发条件 | 说明口径 |
| --- | --- | --- |
| `structure-degraded` | `table.structure.state !== 'sound'` | 缺列与丢弃值不是数据本身的内容，evidence 直接带 `structure.reasons` |
| `parse-errors` | `table.issueTotals.errors > 0` | evidence 取 `issueGroups` 里 `severity==='error'` 的分组按总量降序最多 4 条，形如「引号未闭合（MissingQuotes）：1 条」 |

说明性提示（`notice`）不阻止分析：单列文件、重名表头改名这类文件照常出统计卡片——已用 `UndetectableDelimiter` / `DuplicateHeaderRenamed` 用例钉住。`parseErrorCount` 读 `issueTotals.errors` 而不是明细数组长度，因此 3,000 条错误的文件也按全量真实值判断（`table.issues.length` 被 200 上限截断，不能用）。

被阻止时界面**不减少任何浏览能力**：原始表格、解析告警、结构横幅全部照常，只是把「数据质量概览」换成琥珀色说明卡（`data-testid="quality-blockers"`）解释为什么现在不出结论、怎么修（补齐引号、统一字段数）以及修完能得到什么。解析错误一律有出口，不存在静默忽略。

### 任务 B：缺失值检测（`summarizeMissingValues`）

四种单元格状态分别计数，互不合并：

| 单元格 | 判定 | 计入 |
| --- | --- | --- |
| `''` | 内容缺失 | `emptyCount`（缺失单元格数量） |
| 只有空白字符（`cell !== '' && cell.trim() === ''`） | 疑似空白值 | `blankCount`，**不并入**缺失数量，单独在文案里说明 |
| `null` | 结构性缺列（该行没读到这一列） | `structuralGapCount`，与空单元格不同口径 |
| `'0'` / `'0.0'` / `'-0'` / 任意非空文本 | 实际内容 | 都不算缺失 |

输出：总记录数、列数、单元格总数、逐列 `emptyCount/blankCount/structuralGapCount/presentCount` 与三个逐列比率、全表缺失数、存在空值的字段数、需要关注的字段 `focusColumns`（按 `qualityGapRate` 降序，同率按缺失数、再按列序）。比率统一走 `ratioOf(numerator, denominator)`：分母非正即返回 0，只有表头的文件不出现 `NaN` / `Infinity`（用例断言 `Number.isFinite` 与 `Number.isSafeInteger`）。逐列四类计数之和恒等于 `recordCount × columnCount`（守恒式已入测试）。

不做的事：不填充、不插值、不标记「建议删除」，也不判断数值大小是否离谱。

### 任务 C：完全重复记录（`findDuplicateRecords`）

单趟扫描 + `Map<string, number | number[]>`，键为 `JSON.stringify(row)`——`null` 与 `''` 天然是不同字符串，因此缺列行不会和空单元格行凑成一组；没有 O(n²) 两两比较；只出现一次的行存下标本身，重复了才升级成数组，干净文件不会为每行额外分配数组。

三个数量分开报告，避免「重复 5 行」和「重复 3 组」混为一谈：

- `duplicateGroupCount` 重复组数
- `recordsInDuplicateGroups` 涉及重复的记录数
- `extraCopyCount = recordsInDuplicateGroups - duplicateGroupCount` 额外副本数
- `duplicateRate` 分母是记录数（`ratioOf` 兜 0）

重复组明细上限 `MAX_ITEMIZED_DUPLICATE_GROUPS = 200`，上限之外只计入总数，并由问题列表里一条「另有 N 组重复记录没有逐条列出」明确说明。每组记录 `firstRowIndex` 与完整 `rowIndexes`。判定口径是**整行每个字段都相同**，所以 `sample_id` 不同、测量值相同的两行不会被判为重复（已有用例覆盖）。不删除、不去重、不改动 `table.rows`。

### 任务 D：「数据质量概览」UI（`DataQualityPanel`）

挂在 `DataPreview` 的统计卡/解析告警区之后、原始表格之前，分区共存而非替换：

- 四项统计卡：数据总行数 / 存在空值的字段数（`1 / 4 列`）/ 缺失单元格数量 / 疑似重复记录数量
- 一句总量说明：整表单元格数、空值占比、疑似空白值与结构性缺列（有才出现）、重复组数与额外副本数及占比
- 问题列表首屏 5 条、每批 5 条（`MAX_ITEMIZED_QUALITY_FINDINGS = 100` 是生成上限，界面在此之上再分批），每条带「建议确认」/「仅说明」徽章；缺失率 ≥ `ATTENTION_QUALITY_GAP_RATE`（0.1）为建议确认，低于它只是说明
- 措辞谨慎：「疑似重复记录：3 行内容完全相同（从第 5 个数据行开始）……重复不等于错误，可能是同一份记录的合法副本，请人工确认后再决定是否处理，本次没有删除或改写任何行。」数据行序号是 1 基的**数据行**序号，不含表头，也不与文件物理行号混用
- 视觉沿用品牌青绿（`border-brand-ring` / `bg-brand-soft` / `text-brand-dark`）+ 浅色卡片；阻止态用琥珀色，与既有 `degraded` 横幅同一色系
- 展开状态在 `table` 引用变化时重置（与 Day 2 的分批加载同一套 derived-reset 写法），换文件不会串用上一份的问题列表

`ProductNotes` 与页脚的范围声明同步改为「CSV 读取、数据预览与数据质量概览（缺失值统计 + 疑似重复记录检测）」，并继续明确异常值标注、图表、修复对比、报告导出尚未实现——页面上没有这些入口。跨行定位与高亮本期未做，面板底部如实写明。

### 开发中修掉的两个真实缺陷（不是我预期写错，是实现问题）

1. **折叠说明被自己的上限挤掉**：「另有 N 组重复记录没有逐条列出」原本追加在列表末尾，当问题数正好撞满 100 条上限时被切片丢掉——恰好在最需要它的时候静默丢弃。改为给它预留一格（`capacity = MAX_ITEMIZED_QUALITY_FINDINGS - truncationNote.length`）后再拼接。
2. **`findingTotals` 语义混乱**：原本数的是「截断前」的草稿条数（例：205），和一份最多 100 条的列表放在一起极易被读成全量。改名 `itemizedFindingTotals` 并对**返回列表**计数，界面文案同步为「已列出 N 条建议确认、M 条仅说明」；真实重复组数只在 `duplicates.duplicateGroupCount` 里。

另有一处测试数据不成立：`a,b\n,\n,` 的行被 Papa `skipEmptyLines: 'greedy'` 整行跳过（记录数 0），改成 `,1` / `,2` 并补一条专门用例说明「全空白行不参与缺失率分母」，与 Day 2 的解析口径保持一致。

### 测试（新增 46 项，93 → 161 中 Day 3 部分）

`src/lib/dataQuality.test.ts` 31 项、`src/components/DataQualityPanel.test.tsx` 12 项、`DataPreview.test.tsx` 新增 3 项集成用例（预览区内共存、阻止态仍可浏览、换文件不串联）。Day 3 要求的 11 类场景全部覆盖：正常无缺失 / 多个空单元格 / 数值 0 不误判 / 只有表头 / 多组完全重复 / 只差一个字段不算重复 / 结构性缺列 / MissingQuotes / 12,000 行重复检查 / 换文件不串联 / 诊断前后 `rows` 逐引用与逐值不变。另有准入 6 项、比率安全、明细上限语义、守恒式、重复分析幂等。

性能：12,000 行（6,000 组两两重复）的重复检测与整份文件统计跑在 `dataQuality.test.ts` 全文件 64 ms 之内（用例自带上限断言 `< 8000 ms`，实测远低于）；明细上限使界面一次性渲染节点数与文件规模脱钩。

没有为了让测试通过而修改任何既有预期：Day 2 的 115 项全部仍通过，唯一被改的是我自己新写用例里的一处错误预期（`a\n"foo` 同时带 1 条 `MissingQuotes` 错误和 1 条 `UndetectableDelimiter` 说明，明细是 2 条而不是 1 条，已用真实解析输出核实后订正）。

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（24 个文件，116 条规则，18 ms；文档改完后复跑 51 ms，仍 0/0） |
| `npm test` | `Test Files 8 passed (8)`，`Tests 161 passed (161)`（csv 69 + dataQuality 31 + DataPreview 23 + DataQualityPanel 12 + App 9 + display 9 + CsvUploadPanel 4 + format 4），2.94 s（复跑 4.54 s，同为全绿） |
| `npm run build` | `tsc -b && vite build` 成功，28 个模块；`index.html 0.69 kB`、`CSS 22.36 kB (gzip 5.33)`、`JS 280.50 kB (gzip 89.76)`，189 ms |

更新四份文档后复跑 `npm run build`：产物文件名与体积完全不变（`index-Bs1Cn7h0.css` / `index-mBAWFJEk.js`），也就是本轮文档里写到的类名字面量没有被 Tailwind 的自动内容扫描当成新用法，已知限制第 11 条这次没有复现。

### 浏览器验证（开发服务器 5174，真实 DOM 读取）

本轮内置浏览器没有可视表面（`viewport=0x0`、`visibilityState=hidden`），指针点击与 `take_screenshot` 返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`；因此交互全部用 `evaluate_script` 派发真实的 `File` + `change` 事件走既有解析路径，读回的是渲染后的 DOM 文本与几何值，不是快照之外的推断。

| 检查点 | 实测 |
| --- | --- |
| 内置示例的统计卡 | `12 行` / `1 / 4 列` / `2 个` / `0 行`，「整表 48 个单元格里空值占 4.2%」，1 条建议确认「「height_cm」有 2 处内容不完整」（16.7%） |
| 分区共存 | 同一页 `<tbody tr>` 仍是 12 行，原始表格逐格内容与质量结论同时可见 |
| MissingQuotes 阻止态（`a\n"foo`） | 琥珀色面板 +「这份 CSV 暂时没有进行数据质量分析」；blocker 文本「解析阶段有 1 条会读错数据的格式问题……」+「· 引号未闭合（MissingQuotes）：1 条」；`quality-stats` 与 `quality-findings` 均不存在；表格（1 行）与解析告警照常可见 |
| 缺失 + 重复混合文件（8 列 7 行） | `7 行` / `3 / 8 列` / `3 个` / `3 行`，「整表 56 个单元格里空值占 5.4%」，重复条目「涉及数据行序号：5、6、7」+「请人工确认」+「没有删除或改写任何行」 |
| 问题列表分页 | 8 列 × 6 行（每列 1 个空单元格）首屏 5 条 →「再显示 3 条问题（还有 3 条未展开）」→ 8 条 →「已显示全部8条问题」 |
| 换文件不串联 | 展开后切到干净文件：`quality-findings` 消失、统计卡回到 `2 行` / `0 / 2 列` / `0 个` / `0 行`、出现绿色「没有发现空值或整行重复」、无上一份的 `c8` 残留 |
| 窄屏（近似） | 把根容器约束到 375 px 时 `document.body.scrollWidth = clientWidth = 375`（无页面级横向溢出），宽表 `scrollWidth 448 > clientWidth 284` 被关在 `overflow-auto` 的 `table-scroll` 内 |

### 已知问题

- 375 px 那条只是**容器宽度约束**的近似：视口 0×0 时 `sm:` 断点一律不生效，不能等同于真实手机布局，也没有像素截图。真实窄屏/宽屏排版仍需人工过一遍。
- 诊断只看单元格内容，不做列类型推断：`'12.4 kg'` 与 `'12.4'` 现在同属「有内容」，「同一列类型不一致」属于 F2 剩余部分，需要先补类型推断。
- `blankCount` 用 `String.prototype.trim` 口径（含制表符、全角空格、不换行空格），但没有区分「用户故意写的空格」与「误留空白」，只标注为疑似空白值。
- 重复判定是**整行逐字段严格相等**，不会发现「同一只样本换了大小写/多打一个空格」这类近似重复；这是本期刻意保守的口径，避免把合法记录说成录错。
- 跨行定位与高亮（点问题跳表格）本期未做；问题列表只给数据行序号文本。
- 统计仍要求整份文件在内存里（5 MiB 上限不变）；`analyzeDataQuality` 在准入通过时才调用，阻止态不做任何统计开销。
- 开发服务器（5174）是本轮新起的，5173 上另有一个不属于本轮的监听进程，未做处理；本轮未提交 Git、未发布站点。

### 是否需要人工验收

需要：① 真实 375 / 1280 / 1440 px 下「数据质量概览」的排版（本轮无像素截图）；② 缺失率阈值 10% 是否合适（低于它只写「仅说明」）；③ 重复组明细上限 200、问题列表上限 100 + 每批 5 条的口径是否够用；④ 疑似空白值要不要并入缺失数量（现在刻意分开）；⑤ 被阻止分析时琥珀色说明的措辞是否足够清楚、是否还需要给「仍然要看统计」的逃生入口（当前不提供）。

### 下一步（未开工，等你确认）

Day 3 到此停止。Day 4 候选：列类型推断（数值 / 日期 / 分类）→「同一列类型不一致」检测，以及问题列表到表格单元格的跨区定位与高亮；异常值（IQR / Z-score）仍需单独授权后才做。
