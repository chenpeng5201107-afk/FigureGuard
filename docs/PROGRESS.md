# FigureGuard 开发进度

赛道：2026 Qoder 高校创造力大赛 · StudyHack　　周期：14 天　　开发者：单人

---
## 最终收尾（2026-11-20）：全流程回归、UI/UX 打磨与发布前验收

唯一目标：把已有功能验收成可发布的稳定版本——不新增功能、不加后端 / 数据库 / AI API、不重构稳定模块、不提交 Git、不发布站点。本轮做了 ① 真实浏览器 10 步全流程回归 ② 界面与文案的最终打磨 ③ 数据与导出核查 ④ 工程与性能核查 ⑤ 文档与验收清单对齐。

### 验收方式（本轮起有真实像素证据）

- 被测：本机 `npm run dev`（端口 5199）；浏览器：**本机 Chrome 158.0.8127.37 headless + 原生 CDP**（脚本放在仓库外临时目录，未给项目增加任何测试依赖）。
- 用到的 CDP 能力：真实视口仿真（375 / 768 / 1280 / 1440）、`Page.captureScreenshot`、`DOM.setFileInputFiles` 真实上传、`Browser.setDownloadBehavior` 真实下载后检查文件内容、`Log.entryAdded` + `Runtime.exceptionThrown` 收集控制台。
- 5 段流程脚本（flow1～flow5）+ 4 个定点探针，全部重跑于本轮代码改动之后；证据归档到 `docs/evidence/final-20261120/`（8 张截图 + 2 份真实导出的报告）。
- 详细逐项结论见 `docs/ACCEPTANCE.md` 第 12 节。

### 回归结果：没有发现需要改动核心算法的功能性 Bug

- 数据完整性：同一文件两次上传，四项统计与前 4 行逐字一致；全程无写回路径。
- 计数自洽：`conflicts.csv` 原始 122 / 有效 118 / 缺失排除 2 / 类型排除 2 / 实绘 100 / 触顶未显示 18，五类互斥。
- 负值保护：起点 `0` / `-4.1` / `13.14` 一律拒绝并解释「会被裁到坐标轴以下看不见」，`-4.2` 应用但提示「等于最小值的柱子退化为长度 0」，`-10` 正常。
- 修复闭环：手动 95 → 「建议核查」→ 一键修复 → 前后双图（443×320 均有墨）→ 差异表写明「手动 95 → 自动范围」「原始数据未修改」→ 撤销恢复 `yRaw=95` 与风险诊断；连续 3 轮稳定。
- 失效判定：改聚合与改标题 / 单位分别给出不同的诚实失效理由，撤销按钮同步消失。
- 准入隔离：`blocked-quote.csv` / `degraded.csv` 质量统计 0 张卡、图表被拦、`echartsInstances=0`、PNG 禁用并说明原因、报告仍可导出且标注非正式结论（正文 4×「本节未执行」）。
- 资源与性能：反复切文件 / 切图表类型后实例计数 0→1→1、清结果后归 0，无泄漏；12,000 行文件从选中到首屏实测 447 ms，DOM 恒 50 行、整页元素 720～731、longtask 0。
- 导出：PNG 实测 1920×1080（960×540 @2x，既定规格），柱状图 97,132 B / 折线图 125,480 B；报告 7 章齐全、第 1 章即声明内置合成示例数据。
- 控制台：全部流程 `Runtime.exceptionThrown` 与 error / warning 均为 0。
- 响应式：375 / 768 / 1280 / 1440 四个宽度都无页面级横向溢出（`scrollWidth == innerWidth`，仅差滚动条），无越界元素、无空白图表、无小于 24 px 的按钮。

### 修改文件列表（本轮）

- `src/components/HeroPanel.tsx`：副标题从 Day 1 口径改写为覆盖质检 / 图表 / 导出主线的准确描述；新增四张「已实现能力」卡片；保留被验收清单钉住的主标题 `实验数据，先看清，再分析。` 与 StudyHack 眉标。
- `src/components/ProductNotes.tsx`：把 620 字的「当前版本范围」整段换成「当前版本已覆盖（7 条）/ 尚未实现，界面上也没有入口（5 条）」双栏清单；三张价值卡文案与现状对齐；保留「未发现风险 ≠ 结论正确」与准入阻止的边界说明。
- `src/App.tsx`：页脚由与 ProductNotes 重复的 388 字能力清单压缩为三句（本地处理 / 指向范围说明 / 合成数据声明）；`scroll-mt-24` 定位锚点未动（`App.test.tsx` 依赖）。
- `src/components/DataQualityPanel.tsx`：判定口径说明里过期的「跨行定位与高亮在后续版本提供，本期只给数据行序号文本」改为按现状描述；类型冲突候选列表补一句「点击可在下方表格中定位并高亮该单元格」；类型冲突段末尾的「本期只报告…」改为「系统只报告…」。
- `src/components/ChartLab.tsx`：原始记录口径说明去掉界面里泄漏的内部迭代编号「（Day 5 默认行为）」。
- `index.html`：`<meta name="description">` 停留在 Day 1 的「完成解析与预览，为后续数据质检和图表诊断做准备」，改为按当前能力描述（质检 / 图表 / 零基线检查 / PNG 与 Markdown 导出 / 不上传不注册不调外部接口）；`dist/index.html` 相应从 0.69 kB 变为 0.80 kB。
- `README.md`：开头长段改为四条主线 + 未开发项；补 `baseline-demo.csv` 说明与「数据处理与分析限制」小节；示例条目补两个内置数据集。
- `docs/ACCEPTANCE.md`：版本头改 v1.0-rc；第 1 节自动化数字换成 2026-11-20 实测（含逐文件用例分布）；已知限制 21 更正；新增第 12 节（全流程逐项结果、重点验证结论、界面改动与未改动理由、响应式 / 可访问性实测、本轮修复清单、仍需人工确认）。
- `docs/ARCHITECTURE.md`：版本头 v0.4 → v1.0；目录树补 `examples/baseline-demo.csv`；`reportExport.test` 29 → 35、`chartExport.test` 20 → 22；示例加载流程改为参数化 `loadExampleCsv(key)`；产物清单补 `baseline-demo.csv` 与 `favicon.svg`；F5/F6 行末「报告导出仍未实现」更正为已在 Day 9 落地。
- `docs/PROGRESS.md`：本节。
- `docs/evidence/final-20261120/`：新增本轮真实像素证据与两份导出报告。

### 刻意不改的三项（附理由）

- 页面容器宽度保持统一 `max-w-6xl`：图表区已经是整块容器宽度（1280 / 1440 下画布 978×420），单独把工作台改成 `max-w-7xl` 会让首页 / 上传区与工作区宽度不一致，收益不足以抵消观感割裂。
- 散点图未选齐字段时标题写「（未选择字段）」：这是刻意设计（不编好看的标题），并有 `chartConfig.test.ts:58-59` 钉住。
- 不做代码分割 / 懒加载：JS 888.09 kB（gzip 290.10 kB）主要是按需注册后的 ECharts，`echartsCore.ts` 已只注册 Bar / Line / Scatter + Grid / Tooltip / Title + CanvasRenderer；进一步拆分要动 `App` / `ChartLab` 的既有测试与准入闸门，属于「为省几十 KB 引入不稳定性」。

### 测试命令与实际结果

| 命令 | 实际结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（49 文件 / 116 规则 / 113 ms） |
| `npm test` | `Test Files 18 passed (18)`、`Tests 701 passed (701)`，约 18.7 s；未删除、未放宽任何用例 |
| `npm run build` | `tsc -b` + `✓ built in 705ms`，595 模块；`index.html 0.80 kB`、CSS 26.23 kB（gzip 5.91）、JS 888.09 kB（gzip 290.10）；`dist/examples/` 两份 CSV 与 `dist/favicon.svg` 在位 |
| 浏览器回归 | flow1～flow5 + 4 个探针全部重跑通过，控制台异常 0 |

### 已知问题 / 待办

- 未提交 Git、未推送、未发布站点：等待你授权（`dist/` 已可直接静态部署，Qoder Sites 描述文件在仓库根目录）。
- 仍需人工确认：常用前台浏览器（Chrome / Edge 正式版）肉眼过一遍首页与工作台排版；两份归档报告与 Day 9 被阻止报告的措辞通读。
- 本轮按任务书要求不启动下一阶段、不排 Day N；等待 ChatGPT 最终代码审查。

---
## Day 9 最终整改（2026-11-19）：质量准入失败时的报告隔离

唯一目标：修掉 Day 9 审查抓到的一个 P0 可信性缺陷——**质量准入未通过时，导出的 Markdown 报告头部声明「不提供正式结论」，正文却仍把图表配置、有效记录统计与零基线诊断原样写进去**，自相矛盾。本轮只做这一件事，不提前开发 Day 10，不加功能、不改原始 CSV、不重构 ECharts、未提交 Git、未推送、未发布站点。

根因：`buildMarkdownReport()` 只在首段拼了一句「本次未输出数据质量统计」的免责声明，第 3～6 节仍直接消费调用方传入的 `input.chart` / `input.repair`；隔离只挡在 React 层，纯函数本身不设防，任何人绕过 UI 直接调它都会拿到「非正式横幅 + 正式正文」的矛盾报告。

### 修改文件列表

- `src/lib/reportExport.ts`：把准入闸门下沉进报告纯函数本身。新增导出常量 `ADMISSION_BLOCKED_HEADLINE`（非正式结论横幅）与 `ADMISSION_BLOCKED_SECTION_NOTE`（「未执行」不等于「检查通过」，也不等于「没有问题」）；以单一 `allowed = input.admission.allowed` 驱动——`sectionQuality` / `sectionChartConfig` / `sectionRecords` / `sectionDiagnostic` / `sectionRepair` / `sectionBoundary` 各加 `!allowed` 分支，只写「本节未执行 / 正式结果未输出」并声明「即使调用方传入了配置／诊断／修复记录也不复述」，第 1 节保留真实解析状态、结构降级依据与逐条阻止依据，第 7 节说明分析边界。关键：即使传入非空 `chart` / `repair` / `quality`，纯函数自行遵守准入规则，不依赖 React UI。
- `src/components/ChartLab.tsx`：调用层同步设防——`reportChart` 与 `reportContext.repair` 在 `admission.allowed` 为假时一律传 `null`，不把未经信任的图表分析作为正式报告输入；PNG 禁用逻辑（`renderChart` / `evaluateChartExport` / `pngContext`）一字未改。留证报告仍可导出。
- `src/lib/chartExport.ts`：`describeExportTarget` 在未通过准入时返回统一的 `ADMISSION_BLOCKED_CAPTION`（PNG 已禁用、Markdown 仍可留证、正文非正式、修好文件后重传），去掉尾部拼接的旧 `admissionNote`；`evaluateChartExport` 未动。
- `src/components/ChartExportPanel.tsx`：新增必填 `admissionAllowed` prop，导出提示段按准入状态分叉，与报告文案、下载面板说明口径一致。

测试（只增不减，原有断言一条未放宽）：

- `src/lib/reportExport.test.ts` 29 → 35（新增 R1–R6）：缺列 CSV 被阻止但有 ≥3 条有效数值记录且诊断仍为 `risk`；引号未闭合导致 `structureState==='sound'` 但仅 `MissingQuotes` 也被阻止；对抗性注入非空 `quality`/`chart`/`repair`（借一份真实修复记录）后 `buildMarkdownReport()` 仍第 2–6 节全「未执行」、不含任何正式表行；七标题齐全且各节带 NOTE；正常 CSV 仍输出完整正式报告；确定性与不泄漏原始行。
- `src/lib/chartExport.test.ts` 20 → 22：被阻止时装配出的报告只留证（活态数据 `chart` 非空且诊断 `risk`，但产物不含 `| 图表类型 |`、`| 检查状态 |`、状态码）；被阻止说明文字与报告口径一致。
- `src/components/ChartLab.test.tsx` 135 → 141：`downloadStub` 扩展为同时捕获 Blob（加法，不改既有用例）；新增缺列结构留证报告端到端（`| 数据质量准入 | 未通过 |`、4×「本节**未执行**」、0 个正式标记、回显「Markdown 报告已导出」证明未抛异常）、未闭合引号案例、正常演示（PNG + 2 次下载、7 节、`| 图表类型 | 柱状图 |`、`96 – 98`、`状态码 clear`）、风险→修复→撤销仍在正式报告记录、下载面板提示/说明在两种状态下一致、只读 CSV 行一字未改。

### 回归证明（两次破坏性验证，均已恢复）

1. 把五处 section 调用里的 `allowed` 改成 `true`，恰好 5 个新增纯函数/装配测试失败（R1–R4 + chartExport 装配），改回即绿。
2. 用 `cp` 备份后撤掉 ChartLab 的图表闸门与报告闸门（还原到原缺陷态），2 个被阻止的 ChartLab 集成用例失败、4 个准入通过态用例仍绿；随后从备份恢复两道闸门并复核 `ChartLab.tsx:434-448`、`reportExport.ts:838-842` 已重新设防。

### 工程验证（本轮真实结果）

- `npm run lint`：`Found 0 warnings and 0 errors.`（49 文件 / 116 规则 / 45 ms）。
- `npm test`：`Test Files 18 passed (18)`，`Tests 701 passed (701)`；其中 reportExport 35、chartExport 22、ChartLab 141、DataPreview 46。基线 687 项全保留，本轮净增 14 项。
- `npm run build`：`tsc -b` 通过，`✓ built in 347ms`，`dist/index.html 0.69 kB`、`dist/assets/index-DL5aUXPz.css 26.05 kB (gzip 5.88)`、`dist/assets/index-SEWiun5Y.js 886.68 kB (gzip 289.92)`；仅既有的 >500 kB 分包提示（Day 5 起就有，非本轮引入）。

### 真实浏览器验收（内置 Chromium，dev server `http://localhost:5188/`，真实 `upload_file` + 真实点击下载）

- **正常 CSV** `group,value / A,96 / B,98 / C,97`：解析 3×2、准入通过；点「导出当前图表 PNG」→ 落盘 `image/png`、IHDR **1920×1080**、76,393 B；点「导出 Markdown 报告」→ 8,163 B、七个章节齐全，含 `| 图表类型 | 柱状图 |`、`| 检查状态 | 未发现风险（状态码 clear） |`、`| 进入图表的 Y 数值范围 | 96 – 98 |`。
- **结构错误 CSV** `group,value / A,96 / B,98 / C,97 / D`（末行缺列）：页面显示「4 行 2 列，1 条格式问题、1 条说明提示」「这份 CSV 暂时不能生成正式图表」；PNG 按钮 `disabled`（原因为准入未通过），Markdown 按钮可用；导出的报告 7,536 B，程序化核对：7 个 `## ` 标题、4 处「本节**未执行**」、5 处「未执行不等于检查通过」NOTE、`数据质量准入 | 未通过`，且 `| 图表类型 |`／`| 检查状态 |`／`状态码`／`分组摘要`／`96`／`98`／`97` 等正式标记**全部为 0**；报告首段为 **⚠ 非正式结论** 横幅、第 1 节含真实结构降级依据与 2 条阻止依据。
- **无 JavaScript 异常**：全程 `window.onerror` / `unhandledrejection` 记录为 0；控制台 `error`+`warn` 查询 `<no console messages found>`。
- **证据归档**：下载落在 `C:\Users\zxcvb\Downloads\`（4 个 UUID `.tmp`，大小与内存 Blob 逐一相符），已 `cp` 进 `docs/evidence/day9-browser/`（`normal-chart.png` / `normal-report.md` / `broken-structure-report.md`）并 `cmp` 校验字节一致、PNG 签名 `[137,80,78,71,13,10,26,10]` 有效；未删除你下载夹里的任何文件。

### 已知问题与限制

- 视口仍为内置浏览器隐藏态，375／1280／1440 视觉与响应式未肉眼验证（沿袭 Day 9 主体记录）。
- 引号未闭合（`structureState==='sound'` 仅 `MissingQuotes`）与缺列（`degraded`）两条阻止路径都由单元/集成测试覆盖；浏览器实测走的是缺列路径。

### 是否需要人工验收

建议但非阻塞。核心缺陷已在纯函数层设防并经真实浏览器复核；可用本机 Chrome/Edge 前台窗口肉眼看一眼被阻止报告的措辞与正常 PNG 观感。

### 下一步（未开工，等你确认）

Day 9 整改到此停止，等待最终审查。未提交 Git、未推送、未发布；Day 10 内容需你另行授权。

---
## Day 9（2026-11-19）：PNG 图表导出 + Markdown 可复核报告

唯一目标：把 Day 1–8 已经跑通的「导入 CSV → 看质量 → 画图 → 诊断 → 修复 → 前后对比」收在最后一个真实动作上——**把屏幕上这张图导出成 PNG，把这次分析的证据导出成 Markdown 报告**。全程浏览器本地完成：不上传、不登录、不调外部 API、不接大模型、不引截图库；本轮不做 IQR 异常值、不加新风险规则、不做 PDF / Word / Excel、不改原始数据、未提交 Git、未推送、未发布站点。

开工前置检查：Day 8 闭环在工作区完整（`git log` 停在 `98560d6`，起始基线 14 个测试文件 / 576 项测试全绿），`docs/ACCEPTANCE.md` 第 3 节的 375／1280／1440 视觉项仍标注待人工确认。

### 修改文件列表

新增（5 个模块 + 4 个配套测试）：

- `src/lib/fileDownload.ts` / `fileDownload.test.ts`（18 项）：`saveFile()` 用 Blob + Object URL 触发 `<a download>`，点击后延迟 4 秒回收 URL；`buildExportFileName()` 把来源文件名压成安全片段（取末段路径、去扩展名、非「文字/数字/_/-」一律换 `_`、折叠与裁边、命中 Windows 保留名加 `fig-` 前缀、按码点截断 40）。
- `src/lib/chartPngExport.ts` / `chartPngExport.test.ts`（24 项）：`buildPngExportOption()` 只在屏幕 option 之上加表达配置（`animation:false`、白底、把 HTML 标题画进画布、按标题长度抬高 `grid.top`），数据、轴配置与 `yAxis.min` 逐字不动；`exportChartPng()` 建一个有真实像素尺寸（960×540）且 `position:fixed` 的离屏容器 → `setOption(option, true)` → `getZr().flush()` → 等帧 → `getDataURL({type:'png', pixelRatio:2, backgroundColor:'#ffffff'})` → 解码校验确实是 PNG → 交给 `saveFile()`，成功与失败都 `dispose()` 并移除临时 DOM。
- `src/lib/reportExport.ts` / `reportExport.test.ts`（29 项）：七段式报告纯文本装配 + Markdown 转义 + 报告文件名。
- `src/lib/chartExport.ts` / `chartExport.test.ts`（20 项）：把「能不能导出、导出的是哪张、点了交给谁」收敛成可测纯函数（`evaluateChartExport`、`describeExportTarget`、`buildPngRequest`、`buildReportChartContext`、`runPngExport`、`runReportExport`、`errorText`）。
- `src/components/ChartExportPanel.tsx`：只渲染与转发，不做任何统计。

修改：

- `src/lib/echartsCore.ts`：按需注册补 `TitleComponent`（PNG 需要把标题画进画布）。
- `src/components/ChartLab.tsx`：把当次渲染的 `option`、生效标题、`ChartDataResult` 计数器、`BaselineDiagnostic`、`ChartRepairRecord`、准入与质量结果原样交给导出层；新增 `displayedRecordsCount` 与展示上限触顶数。
- `src/components/ChartLab.test.tsx`：Day 9 由 18 项增至 20 项（本轮补的两条回归测试），既有用例一项未删、未放宽。
- `src/components/ChartExportPanel.tsx`：本轮抓到并修掉上述两个缺陷（补 `runningRef` 重置、拆开两个 `aria-describedby` 目标）。
- 页面与文档文案同步（去掉「报告导出尚未实现」的过期声明）：`src/components/ProductNotes.tsx`（当前版本范围段）、`src/App.tsx`（页脚能力清单）、`README.md`（版本号 Day 6 → Day 9、能做什么清单、`echartsCore` 模块列表、目录结构说明）、`docs/PRD.md`（F7 状态改为「已完成 V1」）、`docs/ARCHITECTURE.md`（目录结构 + 依赖方向 + 第 6 节新增「成果导出」步骤）、`docs/ACCEPTANCE.md`（新增第 11 节 Day 9 验收）。
- 本轮还顺带修掉了 `chartRepair.test.ts` 里一处会随机数失败的历史用例（11 月某月第 30 天并不存在），未动其它稳定模块。

### 关键设计决定

- **屏幕即导出**：PNG 用的就是 `ChartCanvas` 当前那份 option 对象引用，不重新计算统计、不重新推类型、不重新聚合；Markdown 用的同样是这次渲染的 `ChartDataResult` / `BaselineDiagnostic` / `ChartRepairRecord`。因此「改字段／改轴／修复／撤销之后再导出」与「先导出」在配置完全相同时产物一致。
- **报告不允许出现示例值**：正文所有数字都从传入对象取，测试用 `expect(markdown).not.toContain('height_cm')` 一类断言把 A=96／B=98 这类写死内容挡在门外。
- **准入被阻止时报告仍可导出**：它记录的正是「为什么不能给结论」，正文首行加 **⚠ 非正式结论** 横幅并明确声明不输出质量统计与风险结论；PNG 则禁用，因为可能被误读的图不该外流。
- **修复记录只在存在有效 `ChartRepairRecord` 时输出**，并把「修复前真实纵轴下界」取自当时真正写进 `yAxis.min` 的值，而不是输入框原文；自动范围一律写成「不固定纵轴下界，由坐标轴自动包含 0」，绝不写成「下界恰好为 0」。
- **单位未填写就保持未填写**，不自动补测得单位；均值必须给每组样本数 n 与原始值列表，求和必须标成「用户选择的聚合口径」而不是数据总量；折线图必须交代按 X 轴日期升序绘制、缺失或非法日期不画且不插值。

### 本轮浏览器实测抓到的两个真实缺陷（已修 + 已补回归测试）

1. **报告导出后两个按钮永久失效**。`handleReportExport()` 置 `runningRef.current = true` 后，`finally` 里只 `setPhase('idle')`，漏了 `runningRef.current = false`；于是第一次导出 Markdown 之后，同一挂载内的所有后续导出点击都被 `runningRef.current` 挡掉——按钮看着可点、`aria-busy=false`，但什么都不发生，界面停在上一条成功回显上。修复：补 `runningRef.current = false`。回归测试 `报告导出后按钮仍可再次触发：报告 → PNG → 报告 三次点击都落文件` 断言 3 个下载名字依次为 `.md/.png/.md`；把这行改回去跑该用例，实测失败（`AssertionError: expected 1 to be greater than 1`），改回来通过——确认它真能挡住这个 bug，而不是碰巧绿。
2. **`aria-describedby="export-report-hint"` 指向不存在的 id**。原来整个提示块只有一个 `id="export-png-hint"` 的外层 `div`，报告按钮的 IDREF 悬空。修复：把 id 分别落到 PNG 说明段与 Markdown 说明段上，两条说明各自可被引用。回归测试 `两个导出按钮的 aria-describedby 都指向真实存在的说明文本` 逐个解析 id 并断言目标存在且文本非空。

### 测试（576 → 687，新增 111 项，未删除或弱化任何既有用例）

- Day 9 新模块 91 项：`fileDownload` 18 + `chartPngExport` 24 + `reportExport` 29 + `chartExport` 20。
- `ChartLab.test.tsx` Day 9 块 20 项：禁用态与原因、说明文字与屏幕口径一致、PNG 请求装配、离屏实例生命周期、柱／散／折三种当前画面导出的 option 与轴配置一致性、下载名与体积回显、失败只给中文说明、连点不重复起实例、反复导出实例全部销毁、`aria-describedby` 完整性、导出前后 `CsvTable.rows` 与画面统计一字不差。
- 后台页面相关：`requestAnimationFrame` 不触发时靠每帧 60ms 超时兜底仍完成导出；页面 `visibilityState === 'hidden'` 时跳过等帧立刻取图，导出既不挂起也不漏 `dispose`。
- 回归：Day 1–8 的 576 项（解析、列语义、质量、准入、图表、配置、轴起点与裁剪保护、诊断、修复闭环）全部仍绿。

### 工程验证（真实结果）

- `npm run lint`：`Found 0 warnings and 0 errors.`（49 文件 / 116 规则）
- `npm test`：`Test Files 18 passed (18)`，`Tests 687 passed (687)`
- `npm run build`：`tsc -b` 通过，`✓ built in 373ms`，`dist/index.html 0.69 kB`、`CSS 26.05 kB (gzip 5.88)`、`JS 881.94 kB (gzip 288.51)`；仍有既有的 >500 kB 分包提示（Day 5 起就有，非本轮引入）。

### 真实浏览器验收（内置浏览器 `http://localhost:5175/`，隐藏视口，`evaluate_script` 派发真实 DOM 事件）

- **导出真的落盘**：`C:\Users\zxcvb\Downloads` 现有 14 个 `figureguard-*` 文件，PNG 与 `.md` 都在。磁盘上的 PNG 字节数与内存 Blob 一致（`figureguard-chart-dose-response-20261119-120142.png` 117,430 B、`figureguard-chart-baseline-demo-20261119-120105.png` 75,141 B），IHDR 均为 1920×1080，签名 `[137,80,78,71,13,10,26,10]`；`.md` 无 BOM（首三字节 `35 32 70`）、`toString('utf8')` 无 U+FFFD 替换字符，中文正常。
- **导出跟随屏幕配置**（同一份 3 条演示数据，只改纵轴起点）：自动范围 76,393 B／墨迹占比 0.4653；手动 95（风险态）80,174 B／0.3249；点「一键恢复零基线」后再次导出 76,393 B／0.4653，与自动那次**同尺寸同哈希**——证明 PNG 用的是当前生效轴配置，也证明修复确实把轴恢复到自动态。
- **标题画进画布**：把标题改成「处理组实测高度对比」后导出 75,141 B，顶部 90 px 带内非白像素 7,007（页面里的 HTML 标题不会进 `getDataURL`，这是标题真被画出来的证据）。
- **散点／折线同样可导**：`dose-response.csv` 散点 80,077 B／墨迹 0.0272，折线 117,430 B／0.0308（点数少、画布大，占比低是真实形状），说明文字与屏幕一致（「X 轴「dose」→ Y 轴「response」· 原始记录 · 实际绘制 4 个数据点」）。
- **报告内容来自当次计算**：风险态 8,388 B（3,662 字符）里 `| 纵轴起点 | 手动 95（该值已真正写进 ECharts 的 yAxis.min，是画布实际使用的下界） |`、`| 检查状态 | 建议核查（状态码 risk） |`；点修复后 9,597 B，`## 6. 图表修复记录` 出现 `修复前真实纵轴下界 | 95`、前后配置差异表与「修复后重新计算的诊断状态：未发现风险（状态码 clear）」；全文不含 `height_cm`／`stem_count`。
- **准入被阻止的 CSV**（`恶意 结构#错位.csv`）：PNG 按钮 `disabled`，原因写明「数据质量准入未通过…此时不导出可能被误读的图表」；同帧各点一次只有 1 个下载（报告）；报告首段 **⚠ 非正式结论** 且正文声明「本次未输出数据质量统计」；文件名 sanitize 为 `figureguard-report-恶意_结构_错位-…md`，报告内表格写作 `「恶意 结构\#错位.csv」`（`#` 已转义）。
- **只导出一次、不泄漏**：连点 3 次同帧只起 1 个离屏实例；导出结束后 `document.querySelectorAll('[data-testid="chart-png-export-host"]')` 与 `a[download]` 均为 0；主图实例从未被 `dispose`。
- **无障碍与反馈**：两个按钮可访问名固定为「导出当前图表 PNG」「导出 Markdown 报告」，进度只写在 `role=status` 的回显里；被阻止时 `role=alert` 且 `aria-live=assertive`；`aria-describedby` 两条 IDREF 均可解析；区域 `aria-label="导出分析成果"`。
- **控制台**：`types:[error]` 查询为 0 条；仅有关于图表测量尺寸为 0 的既有 warn（隐藏视口所致，非导出路径）。

### 已知问题与限制

- **375／1280／1440 px 的视觉与响应式仍未真验**：内置浏览器视口 `0×0`、`take_screenshot` 与 `resize` 都不可用，只能确认导出面板沿用了 Day 5–8 已验收的 `min-w-0`／`flex-wrap`／`break-words` 类结构与 DOM 状态，不能替代肉眼检查。
- **PNG 清晰度靠像素统计而非肉眼**：已验证尺寸（1920×1080）、白底、2 倍像素比、墨迹分布与标题带，但插进幻灯片的实际观感需你人工看。
- **报告不内嵌图片**：P0 只要求报告交代导出配置并提示把 PNG 一起归档，因此正文只有「建议与 PNG 一同归档」。
- **P1「前后对比两张图各导一张」本轮未实现**（属可选增强，且当前 `runningRef` 互斥锁一次只允许一个导出）。
- 开发服务器端口：本轮用 `:5175`，`:5173`／`:5174` 上仍有既有 dev server 在监听，未动。
- 演示数据输入框对超长标题的截断行为未单独验证：`buildPngExportOption()` 会按标题长度抬高绘图区上边界（单测覆盖），但真实浏览器里长标题的换行观感没截到图。

### 是否需要人工验收

需要。请用本机 Chrome/Edge 前台窗口确认：① 三次导出（自动／手动 95／修复后）的 PNG 观感与清晰度；② 报告在 VS Code 或 GitHub 里渲染的表格是否不破版；③ 375／1280／1440 三档宽度下导出区不挤压、不换行错位；④ 键盘 Tab 能到达两个按钮且 Enter 生效。

### 下一步（未开工，等你确认）

Day 9 到此停止，等待 ChatGPT 代码审查与人工验收。候选：把 Day 8 前后对比的两张图各导一张（P1）、报告内嵌 PNG 的 base64 或本地引用、把误差棒／异常值列为独立议题（均需新授权，不属本轮范围）。

---
## Day 8（2026-11-19）：风险诊断 → 一键修复 → 前后对比 → 撤销

唯一目标：把 Day 7 已经落地的「柱状图非零基线」诊断接上一条真实可走的交互闭环——发现风险 → 一键修复 → 两张真实 ECharts 前后对比 → 说明改了什么 → 单步撤销。本轮不做 PNG / Markdown / PDF 导出，不加新风险规则，不做异常值检测，不建通用多级历史，不接后端与数据库，未提交 Git、未推送、未发布站点。

开工前置检查：Day 7 的纵轴部分裁剪保护（`resolveYAxisStart()` 三段判定 + `notice`）确认已在工作区（`git log` 停在 `98560d6`，Day 7 改动尚未提交但文件齐全，起始基线 14 文件 / 501 项测试全绿），因此允许进入 Day 8。

### 修改文件列表

| 文件 | 变化 |
| --- | --- |
| `src/lib/chartRepair.ts` | 新增（346 行）：修复资格判定、修复记录构造、失效判定、撤销安全检查、配置差异与说明文案，全部是纯函数 |
| `src/lib/chartRepair.test.ts` | 新增（422 行 / 38 项）：六门条件、前后快照、失效边界、撤销安全、差异文案 |
| `src/components/ChartRepairPanel.tsx` | 新增（132 行）：修复完成状态、并排两张真实 ECharts、「本次修复修改了什么？」、撤销按钮 |
| `src/components/ChartLab.tsx` | 图表表达检查面板内加修复按钮（含不可修复原因）；新增 `repair` / `repairNote` 状态、渲染期失效清除、`handleRepair` / `handleUndoRepair`；挂载对比面板 |
| `src/components/ChartLab.test.tsx` | 79 → 115 项（Day 8 新增 36 项 A–E 组）；ECharts mock 改为记录每个实例的容器，便于按无障碍名定位「修复前 / 修复后」两个实例 |
| `src/lib/chartData.ts` | 一行：`barOption` 纵轴 `nameGap` 26 → 46，修掉浏览器实测到的轴名压住小数刻度（96.5）的真实重叠 |
| `src/lib/chartData.test.ts` | 107 → 108 项（断言 `nameGap >= 40`） |
| `src/components/DataPreview.tsx` | 内置 `baseline-demo.csv` 时改说合成演示数据（A=96 / B=98 / C=97），并声明修复不改动任何单元格与行号 |
| `src/components/ProductNotes.tsx` | 能力范围文案改为「一键修复、前后对比与撤销已实现」，导出与异常值标注仍明确未实现 |
| `src/App.tsx` | 页脚补修复与撤销说明，并把两份示例数据都标注为合成演示数据 |
| `docs/screenshots/` | 新增 2 张真实浏览器截图（前后对比整页 + 修复前图表含悬浮提示） |

`src/types/chart.ts`、`chartConfig.ts`、`chartDiagnostics.ts`、`chartData.ts` 的聚合与统计、`csv.ts`、`dataQuality.ts`、`columnTypes.ts` 的判定逻辑本轮一字未改；`BASELINE_RULE_ID` / `BASELINE_CONFIG_SOURCE` / `diagnoseBaseline()` / `resolveYAxisStart()` / `toEChartsOption()` / `defaultChartConfig()` / `resolveChartTitles()` 全部复用，没有新建第二套诊断。

### 修复到底改了什么

修复只做一件事：把 `config.yAxisStart` 换成 `{ mode: 'auto', raw: '' }`，然后走 Day 7 那条唯一真值链路重新算一遍——`resolveYAxisStart()` → `appliedMin` → `toEChartsOption(..., { yMin })` → `diagnoseBaseline()`。因此「恢复零基线」不等于把下界写死成 0：修复后 option 里连 `min` 键都不出现，由 ECharts 自己出包含 0 的自动范围，含负值的数据同样不会被裁。CSV 行、字段选择、聚合口径、记录计数与百分比全程不参与，`updateRows` 一个引用都没传进修复模块。

按钮启用条件六道门全部读运行时真实值，缺一不可：`kind === 'bar'`、`admission.allowed`、`result.validCount > 0`、`diagnostic.status === 'risk'`、`diagnostic.ruleId === 'bar-zero-baseline'`、`diagnostic.axisStart.appliedMin !== null && appliedMin > 0`。最后一条读的是生效下界而不是输入框文本，所以填 0 / 负数、填了但被裁剪保护拦下（`appliedMin = null`）、非柱状图、无数据、准入未通过、已解析出空集这些情况下根本没有按钮可点，也不会冒出「修复成功」；不满足时面板只讲当前状态（例如「当前生效的纵轴范围已经包含零基线，本条规则没有风险可修复」）。重复点击被两层挡住：UI 只在 `repair === null` 时给出动作，`createRepairRecord()` 内部再复核一遍资格，返回 `null` 时既不写配置也不追加记录。

### 修复记录数据结构

`ChartRepairRecord`（一次修复一条，钉存后不被后续渲染改写，因为配置全程不可变更新）：

| 字段 | 内容 |
| --- | --- |
| `ruleId` / `action` / `kind` | `bar-zero-baseline` / `restore-auto-zero-baseline` / `bar` |
| `xIndex` / `yIndex` / `xFieldLabel` / `yFieldLabel` / `aggregation` | 修复当时的字段与口径 |
| `beforeConfig` / `afterConfig` | 两份完整 `ChartConfig` 快照 |
| `beforeAppliedMin` | 修复前**真实生效**的数值下界（95），不是输入框字符串；`beforeAxisStart` 为完整 `ResolvedYAxisStart`，`afterAxisStart` 为修复后的解析结果 |
| `evidence` | 原始 `BaselineDiagnostic`（status / message / summary / axisStart / detail） |
| `context` | `table` 对象引用、`rowCount`、`yRange`、标题与轴标题、字段标签 |
| `beforeSnapshot` / `afterSnapshot` | 修复当时的 `ChartConfigSnapshot`（标题、单位、标注） |
| `result` | 前后共用的同一份 `ChartDataResult`（不复制第二份数据） |
| `beforeOption` / `afterOption` | 用同一 `result` 生成的两份真实 ECharts option |

数据上下文用 `CsvTable` 对象引用而不是文件名：重新加载同名 CSV 会得到新对象，旧记录当场失效，不会跨文件串联。

### 失效与撤销规则

渲染期一致性校验（`describeRepairStaleness`，返回中文原因后清记录并留提示）：换数据文件 / 换图表类型 / 换 X 字段 / 换 Y 字段 / 换聚合口径 / 改 Y 轴起点 / 改标题或单位——理由按这个顺序如实展示（例如「已修改分类聚合方式，柱子代表的不再是同一组数值」）。

撤销是单步的：`evaluateRepairUndo` 先挡失效记录，再用当前 `yRange` 复核 `beforeConfig.yAxisStart`，解析仍报错（比如修复后换了字段，95 已越过新的数据最小值）就拒绝写回并说明原因，绝不强行应用过期配置。可撤销时直接把 `beforeConfig` 整体交回，主图、刻度与诊断全部重算——96 / 98 配 95 会重新报出风险，提示「已撤销本次修复：Y 轴起点恢复为手动 95……」。没有记录就没有撤销按钮，撤销后仍可再次修复；撤销同样不触碰 CSV、字段与聚合。本轮按任务书要求只做一条记录，没有历史栈与重做。

### 科学边界（全部在 UI 与测试中固化）

修复与撤销只改图表配置；`CsvTable.rows` 没有任何写路径；数值、记录数、行号、分组不变；文案统一用「已恢复包含零基线的自动纵轴范围」「原始实验数据未发生变化」「当前规则未发现非零基线风险」；不出现「科研错误已修复」「图表已经完全正确」「实验结论更可信了」；差异表明确写了自动范围不等于下界恰好为 0（要读真实刻度才能那样说）；零基线规则只在柱状图生效，散点与折线连入口都不渲染；不引入任何显著性、误差棒或因果结论；`MAX_CHART_ITEMS` 的展示上限与记录统计分离，展示被截断时记录数照常。

### 测试（501 → 576，新增 75 项，未删除或弱化任何既有用例）

| 组 | 覆盖 | 落点 |
| --- | --- | --- |
| A 修复资格与动作 | 95 可修 / 0 与负数不可修 / 填 125 被裁剪保护拦住不可修 / 输入框有正数但实际回退自动不算风险 / 状态 clear、invalid、no-data、准入拒绝、非柱状图各不重复触发 / 修复只改 `yAxisStart` / 修复后 option 无 `min` | `chartRepair` + `ChartLab` |
| B 前后对比 | 前图保留 `min = 95`、后图自动含 0 / 点与类别数组逐位相等 / 类别顺序一致 / 悬浮提示行号与数值一致 / 两张图各自 init 与 dispose / 换 CSV、换字段、换聚合、同名重载后旧对比消失且不复活 | `chartRepair` + `ChartLab` |
| C 撤销 | 可撤销 / 恢复手动 95 / 风险重新算出 / 撤销后再修复 / 无记录不撤销 / 拒绝过期记录 / 撤销不改数据 | `chartRepair` + `ChartLab` |
| D 边界 | 自动范围下负值不被裁 / 聚合柱状图（10,10,20,30 → 20）修复后值与 n 不变 / 130 行时仍真实绘制 130 根柱子且 `displayedCount = 100`、`capHidden = 30` / 空数据与非柱状图无修复源 / 全列类型错误 → 准入拒绝 → 既无诊断也无修复 / 只改标题单位时数据与 option 数据段不变 / 记录上下文与当前 table 不一致时安全拒绝 | `chartRepair` + `ChartLab` |
| E 回归与无障碍 | Day 1–7 既有用例全绿 / 风险卡含规则、说明与依据、修复按钮与理由同一区域 / 修复后状态、对比、撤销、边界说明齐全 / 修复与撤销按钮是原生 `<button>`，disabled 时不可点、可用时可聚焦 | `ChartLab` |

### 工程验证（真实结果）

- `npm run lint`：`Found 0 warnings and 0 errors.`（oxlint，40 文件 / 116 规则 / 14 线程）
- `npx tsc --noEmit`：无输出（0 错误）
- `npm test`：`Test Files 14 passed (14)`，`Tests 576 passed (576)`，Duration 13.09 s（jsdom 的 `Not implemented: getContext()` 与 `[ECharts]` 提示是 mock 环境既有噪声，非失败）
- `npm run build`：`tsc -b && vite build` 成功，`✓ 590 modules transformed`，产物 `JS 845.30 kB │ gzip 275.85 kB`、`CSS 25.65 kB │ gzip 5.82 kB`；唯一告警是既有的「Some chunks are larger than 500 kB」，本轮未做代码分割
- 文案与文档改动后复跑一次：lint 仍 `0 warnings / 0 errors`、`tsc --noEmit` 退出码 0、`576 passed (576)`、构建产物体积不变

### 浏览器实测（本地 `http://localhost:5173/`，内置 `baseline-demo.csv`）

- 手动起点 95 → 主图纵轴真实刻度 95 / 95.5 / 96 / 96.5 / 97 / 97.5 / 98，风险卡报「存在风险」；修复后主图刻度回到 0 / 20 / 40 / 60 / 80 / 100 且风险转为「未发现风险」。
- 点击一键修复：页面上 ECharts `<canvas>` 由 1 个变 3 个（主图 + 前 + 后）；从 React fiber 取到两个真实实例的 option——修复前 `yAxis[0].min === 95`、`xAxis[0].data === [A,B,C]`、`series[0].data === [96,98,97]`，修复后 `min` 为 `undefined`、数据两列逐位相同。悬浮提示实测为「数据行号：1 / 类别：A / 数值：96」。
- 「本次修复修改了什么？」实测七行全部来自真实配置与统计：检测规则（含 `bar-zero-baseline`）、Y 轴起点「手动 95 → 自动范围（由坐标轴自动包含 0）」、更改类型 `chartConfig.yAxisStart`、原始数据未修改、数据记录数「原始 3 条、有效 3 条（实际绘制 3 个展示单元）」、绘图方法「柱状图 · 按类别平均值」、重新检查（取当次真实诊断文本）。
- 撤销：对比区消失、canvas 由 3 回 1、主图 `yAxis[0].min` 实测重新变成 95、单选项回到「手动设置」且输入框仍是 95，提示「已撤销本次修复：Y 轴起点恢复为手动 95……」。
- 失效：修复后把聚合从「不聚合」切到「平均值」，对比当场清除、提示写明「已修改分类聚合方式……」（`role="status"`），canvas 从 3 回到 1，说明两个实例真的各自 dispose。
- 数据未动：以上每一步之后表格单元格实测恒为 `1|A|96  2|B|98  3|C|97`。
- 布局：在 375 / 1280 / 1440 三种宽度下同时渲染同一应用，对比区实测为 375 → 1 列堆叠、1280 与 1440 → `grid-template-columns: 352px 352px` 两列，画布高度统一 320 px，无横向溢出。
- 实测发现并修掉一处真实遮挡：修复前图的小数刻度 96.5 与旋转后的纵轴名重叠（轴名 x 41–53 落在刻度框内），`nameGap` 由 26 提到 46 后轴名 x 移到 21–33、重叠计数 0、未被画布左边缘裁掉；`grid.left = 48` 未动，因此既有断言不受影响。
- 交互与无障碍：修复 / 撤销均为原生 `<button>`；`.focus()` 后 `document.activeElement` 为按钮本身；实际加载的样式表里确有 `:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px }` 与 `@media (prefers-reduced-motion: reduce)` 全局规则。
- 截图：`docs/screenshots/day8-2-repair-compare-633px.png`（前后并排 + 差异表 + 撤销 + 边界说明）与 `docs/screenshots/day8-3-before-chart.png`（修复前 95–98 刻度与真实悬浮提示）。

### 已知问题与限制

- 截图只拿到 2 张：本会话后段桌面内置浏览器的截图通道开始返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`（页面 `visibilityState=hidden`），375 / 1280 / 1440 三档布局与遮挡修复因此改用脚本量取几何数据（`getBoundingClientRect` 与 zrender 显示列表文本框）取证，没有对应截图；未执行的检查一律没写成通过。
- `prefers-reduced-motion` 的对照实测不成立：内置浏览器本身就上报 `reduce`，三次读取的 `option.animation` 都是 `false`，只能确认 option 与全局 CSS 遵循该偏好，没能截到「动画开启」的对照组。
- 修复记录按任务书只做一条（无历史栈、无重做），撤销不跨数据文件、不跨字段与口径变化——这是设计如此，不是缺陷。
- 构建包体仍 > 500 kB（ECharts 全量进单 chunk），本轮按任务书不做拆分与依赖新增。
- 演示闭环需要在页面里手动走完 13 步，未做自动化 e2e；`vitest` + jsdom 覆盖的是逻辑与 DOM 状态，真实刻度像素仍以人工验收为准。

### 下一步

等待 ChatGPT 源码审查与人工验收。之后的候选：报告导出（PNG / Markdown / PDF）、异常值标注（只标注不删除）、散点与折线的其他表达检查、以及按审查结论决定是否补布局快照测试。

---
## Day 7 最终整改（2026-11-19）：纵轴部分裁剪保护（P0）

唯一目标：修掉代码审查发现的那一处 P0——`resolveYAxisStart()` 只拦「起点 ≥ 数据最大值」，拦不住「起点落在数据最小值与最大值之间」的部分裁剪。本轮不动 Day 8 的任何内容：不实现一键修复、不做前后对比与撤销、不做导出，不新建第二套诊断规则。本轮未提交 Git、未推送、未发布站点。

### 问题根因

原实现只有一条范围判定：

```ts
if (yRange !== null && parsed >= yRange.max) { /* 阻止 */ }
```

因此三类会藏掉有效数值的配置被放行，并且被诊断说成「未发现风险」：

| 数据范围 | 手动起点 | 原结果 | 实际问题 |
| --- | --- | --- | --- |
| 96 – 98 | 97 | 应用，`min = 97` | 96 这根柱子被裁到坐标轴以下 |
| -5 – 20 | -1 | 应用，`min = -1` | -5 被裁掉 |
| -5 – 20 | 0 | 应用，`min = 0`，诊断「未发现风险」 | 全部负数被裁掉，却报告正常——把「含零基线」误当成「数据都可见」 |

### 修改文件列表

| 文件 | 变化 |
| --- | --- |
| `src/lib/chartConfig.ts` | `resolveYAxisStart()` 改成三段范围判定（≥ max / > min / = min）；`ResolvedYAxisStart` 新增 `notice` 字段；函数注释写明含负值时不能靠固定 0 兼顾零基线与数据完整 |
| `src/components/ChartLab.tsx` | 手动起点区新增合法但有害的 `yaxis-start-notice` 提示；起点输入框上方加一行「下界必须不大于 Y 数值最小值」的约束说明；风险面板「判断依据」文案改为引用真实数据最小值 |
| `src/lib/chartDiagnostics.ts` | 只改注释：写清裁剪由配置层拦截、本模块以 `invalid-config` 转述，不另立规则（判定分支与状态枚举一字未改） |
| `src/lib/chartConfig.test.ts` | 48 → 62 项（新增「部分裁剪保护」describe 14 项） |
| `src/lib/chartDiagnostics.test.ts` | 15 → 28 项（新增与 `resolveYAxisStart` 的联动组 12 项 + 1 项改写） |
| `src/lib/chartData.test.ts` | 105 → 107 项（`min` 键整体缺席、起点等于最小值仍下发） |
| `src/components/ChartLab.test.tsx` | 63 → 79 项（新增「Day 7 整改：部分裁剪保护」16 项） |

`src/types/chart.ts`、CSV 解析、`chartData.ts` 的聚合与统计、`dataQuality.ts`、`columnTypes.ts` 均未改动；`ruleId` 与 `configSource` 原样保留。

### 修复原理

判定顺序固定为「先解析、再结合真实 `yRange` 判裁剪」，`resolveYAxisStart()` 仍是纵轴起点的唯一真值来源：

| 条件 | 处理 | 理由 |
| --- | --- | --- |
| `parsed >= yRange.max` | `appliedMin = null` + 错误（原有行为） | 所有柱子都被裁掉，连有效范围都形不成 |
| `parsed > yRange.min` | `appliedMin = null` + 错误「起点 X 高于数据最小值 Y」 | 低于 X 的有效数值会被静默藏到轴外，与「不静默隐藏有效实验数据」直接冲突；哪怕只差 0.5 也拦 |
| `parsed === yRange.min` | 照常应用 + `notice` | 没有数值被裁掉，但等于最小值的那批柱子长度退化为 0，如实说明「不能算已经完整可辨」 |
| `parsed < yRange.min` | 应用，`notice = null` | 合法：数据完整，只剩零基线表达问题交给诊断 |
| `yRange === null` | 应用（绘图层本就无点可裁） | 保持 Day 7 的安全空状态，不虚构裁剪结论 |
| 留空 / 非数值 / `NaN` / `Infinity` | 先于范围判定拒绝 | 原有拒绝路径不变，绝不把非有限数写进坐标轴 |

含负值的数据不能靠「把下界固定成 0」同时保住零基线和全部数值：0 一定大于任何一个负数，因此起点 0 在负值数据上是裁剪配置，走 `> min` 分支被拦下、退回自动范围；自动模式下 `barOption` 不带 `min` 且 `scale:false`，ECharts 自己把负值、0 与正值一并装进坐标轴。配置无效时 `appliedMin = null` → `ChartLab` 传 `yMin = undefined` → option 里连 `min` 键都不出现，配合 `EChartCanvas` 的 `setOption(option, true)`（notMerge），旧下界不会残留在真实坐标轴上。诊断侧不需要新规则：`error !== null` 先于风险判定命中 `invalid-config`，面板显示「配置无效」而不是「未发现风险」。原始记录、聚合值、`validCount` 与排除计数在整条链路上都不被触碰——起点只改写 `yAxis.min`。

### 测试（456 → 501，新增 45 项）

任务书要求的 10 项全部覆盖，另有 3 项断言因原行为本身是 bug 而必须改写（见「既有断言的三处变动」）：

| # | 场景 | 落点 |
| --- | --- | --- |
| 1 | 96–98 + 起点 95 合法且仍报非零基线风险 | `chartConfig` / `chartDiagnostics` / `ChartLab` |
| 2 | 96–98 + 起点 97 阻止部分裁剪 | 三处 + 97.5「只差一点」也拦 |
| 3 | 96–98 + 起点 99 继续阻止 | 三处 |
| 4 | -5–20 + 起点 -10 合法、数据完整且含 0 | 三处 |
| 5 | -5–20 + 起点 -1 阻止 | 三处 |
| 6 | -5–20 + 起点 0 阻止，且不得说成未发现风险 | 三处 |
| 7 | 96–98 + 起点 0 合法、无该风险 | 三处 |
| 8 | 换 X/Y 字段、换聚合口径后重新校验（25 对 100–500 合法、对 10–40 裁剪；30 在逐条口径裁剪、平均值口径合法） | `ChartLab` |
| 9 | 配置无效时 `yAxis.min` 不沿用旧下界（`'min' in yAxis === false` + `setOption` 第二参 `true`） | `chartData` / `ChartLab` |
| 10 | 数据点与记录计数不回归（`seriesData` 原样、统计文本与整改前逐字相同） | `ChartLab` |

额外：起点恰好等于最小值（正 / 负两种）应用并给出零长度柱形提示、起点低于最小值时不产生多余提示、非法文本与空串仍先于裁剪判定被拒、非柱状图仍先答「不适用」、无数据仍判「无数据」。

### 既有断言的三处变动（都是被修的行为本身，不是放宽测试）

1. `chartConfig.test.ts` 的科学计数法用例：起点 `1e2` 配 `{min:50,max:400}` 原本断言「应用 100」，而 100 高于最小值 50 正是本轮要拦的裁剪 → 数据范围改为 `{min:150,max:400}`，科学计数法的解析覆盖不变。
2. `chartDiagnostics.test.ts` 的「起点 5、数据 -10..20 → 风险」：该组合现在在配置层就被拦下，已不可能进入绘图 → 改为走真实解析链断言「配置无效」，并补一条正数据（6..20 + 起点 5）仍判风险，风险识别覆盖没有减少。
3. `ResolvedYAxisStart` 增加 `notice` 字段后，auto 用例的 `toEqual` 与测试内最小构造器同步补 `notice: null`（纯结构对齐）。

除这三处外，Day 1–6 与 Day 7 的既有断言一项未删、一项未放宽。

### 测试与构建结果（实际执行）

| 命令 | 实际结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（37 个文件，116 条规则，36 ms） |
| `npm test` | `Test Files 13 passed (13)`，`Tests 501 passed (501)`，17 s 级；逐文件：`chartConfig 62` / `chartDiagnostics 28` / `chartData 107` / `ChartLab 79` |
| `npm run build` | `tsc -b && vite build` 成功，`built in 387ms`；`index.html 0.69 kB`、`CSS 25.36 kB (gzip 5.79)`、`JS 832.35 kB (gzip 272.30)`；仍只有既存的单包 > 500 kB 体积提示（echarts 造成，未处理） |

本机 `node` 不在 PATH 上，测试通过把 `D:/Soft_Ware`（node v25.2.1 + npm 11.6.2）临时加进 `PATH` 后执行 `npm run lint` / `npm test` / `npm run build` 得到上面的结果，不是等价命令的转述。

### 真实浏览器验证（开发服务器 5180，真实 Chromium + 真实 ECharts 实例）

本轮补上了 Day 7 缺的那一环：通过页面里已加载的 `/src/lib/echartsCore.ts` 拿到 `echarts` 模块，用 `echarts.getInstanceByDom(canvas).getOption()` **直接读真实坐标轴的 `yAxis[0].min`**，不再只看诊断面板文字。内置浏览器仍是 `viewport=0x0`、`visibilityState=hidden`，`take_screenshot` 返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`，所以交互用 `evaluate_script` 派发真实 `click` / 原生 `input` 事件。

| 检查点 | 实测（真实 `getOption()` 值） |
| --- | --- |
| 载入「非零基线演示数据」默认自动 | 诊断「未发现风险」，`yAxis` 无 `min`、`scale:false`，series 3 点，统计「有效记录 3 条」「Y 数值范围 96 – 98」 |
| 手动 95 | `yAxis[0].min = 95`，诊断转「建议核查 / 柱状图非零基线」，回声「当前纵轴起点：95…」 |
| 95 之后改 97（部分裁剪） | `yAxis[0].min` 变回缺省（**旧下界 95 没有残留**），错误文案「起点 97 高于数据最小值 96…」，诊断「配置无效」，series 仍 3 点 |
| 改 99 | 「起点 99 不低于数据最大值 98…」，`min` 缺省，「配置无效」 |
| 改 0（数据 96–98） | `min = 0`，「未发现风险」 |
| 植物示例（含 -4.2）手动 0 | 阻止应用：`min` 缺省、错误文案点名 -4.2、诊断「配置无效」而不是「未发现风险」，series 10 点仍含 `-4.2` 与 `88.6` |
| 植物示例手动 -4.2（等于最小值） | `min = -4.2` 应用，出现 `yaxis-start-notice`「…退化成长度 0…不能算已经完整可辨…」，诊断「未发现风险」（零基线确实包含） |
| 植物示例手动 -10 | `min = -10` 应用，无错误也无代价提示 |
| 换聚合口径后重校验（同一份起点） | 起点 0 在「原始记录」下被拦（最小值 -4.2）；切「按类别平均值」后真实最小值升到 13.14，`min = 0` 照常应用；起点 5 在平均值下应用并报「建议核查」，切回「原始记录」又变回「配置无效」 |
| 控制台 | 无 error；仅 vite debug、React DevTools 提示与 4 条 ECharts「Can't get DOM width or height」（0×0 视口所致，非代码缺陷） |

### 已知问题

- 内置浏览器无可视表面（`window.innerWidth = 0`、画布 `clientWidth = 0`），**未能**完成 375 / 1280 / 1440 px 的排版与横向溢出肉眼核对，也没能截图确认柱子在真实宽度下的高度形态；本轮的浏览器结论全部来自真实 DOM 文本与真实 `getOption()` 数值，不含像素级判断。
- 「起点恰好等于数据最小值」只给提示、不阻止应用：数值确实没被裁掉，但等于最小值的那批柱子长度为 0。是否要把这种「看不见但不缺」的柱子也一并拦下，属于产品口径选择，等审查定夺，本轮不自作主张。
- 零长度柱形的 `notice` 出现在配置区（起点输入框下方），诊断面板本身仍只讲零基线，不重复这条代价说明；两处读的是同一个 `resolveYAxisStart()` 返回值，不存在两套判断。
- 起点判定用的是**实际绘制点**的 `yRange`：因单图展示上限（柱状图 100）未成柱的记录不参与其中，与 Day 5–7 的「触顶」口径一致，本轮未改。
- Day 8 修复动作的接口就位：`ruleId = bar-zero-baseline`、`configSource = chartConfig.yAxisStart` 未变，一键修复只要把配置恢复成 `{ mode: 'auto' }` 就能同时正确包含零基线、正值与负值；本轮没有任何修复按钮。

### 是否需要人工验收

需要：① 375 / 1280 / 1440 px 下配置区新增两行说明（约束句 + 琥珀色代价提示）与诊断面板的排版肉眼检查；② 真实可见视口下起点 95 抬高纵轴、改 97 后退回自动的柱子高度形态确认（本轮只到 `getOption()` 数值层）；③「起点等于最小值只提示不拦截」的口径是否符合预期；④ 错误文案里点名数据最小值、并明说「含负值不能靠设 0」的措辞是否合适。

### 下一步（未开工，等你确认）

Day 7 整改到此停止，等待代码审查。Day 8（一键恢复自动范围 → 前后对比 → 撤销）与 PNG / Markdown 导出均未开工、不在本轮范围。


---
## Day 7（2026-11-18）：柱状图非零基线表达风险诊断 V1

唯一目标：让 FigureGuard 依据**真实用于绘图的纵轴配置**识别普通柱状图的非零基线表达风险，给出证据与建议；只检测、解释、建议，不修复、不对比、不撤销。开工前先核实 Day 6 三个待修问题：`年在前` 文案、`Date.UTC` 的 0–99 补年、极端有限数值聚合溢出——三处均已在工作区改好并有对应测试，414 项全绿，确认无需回退后再开始 Day 7。本轮未提交 Git、未推送、未发布站点。

### 改了哪些文件

| 文件 | 变化 |
| --- | --- |
| `src/types/chart.ts` | `ChartConfig` 新增 `yAxisStart: YAxisStartConfig`（`mode: 'auto' \| 'manual'` + `raw` 原文） |
| `src/lib/chartConfig.ts` | `defaultChartConfig` 带默认自动起点；新增 `resolveYAxisStart()`：数值解析、有限性校验、裁剪判定 |
| `src/lib/chartDiagnostics.ts` | 新增纯函数规则模块 `diagnoseBaseline()` 与诊断结果类型（不依赖 React / ECharts） |
| `src/lib/chartData.ts` | `ChartAxisMeta.yMin?` 进入 `barOption` 的 `yAxis.min`；非有限值被忽略 |
| `src/components/ChartLab.tsx` | 柱状图配置新增「Y 轴起点 自动/手动」控件；新增「图表表达检查」面板 `ChartExpressionCheck` |
| `src/lib/csv.ts` · `src/components/CsvUploadPanel.tsx` · `src/App.tsx` | `loadExampleCsv(key)` 参数化；加「非零基线演示数据」入口；页脚 / 范围声明同步 |
| `public/examples/baseline-demo.csv` | 新增合成演示数据（A=96、B=98、C=97） |
| `src/components/ProductNotes.tsx` | 范围声明如实改为「图表表达检查已覆盖零基线一条规则，仅检测不修复」 |

### 输入 = 绘图 = 诊断，三者同一来源

`resolveYAxisStart(config.yAxisStart, result.yRange)` 是纵轴下界的**唯一**真值来源：自动或配置无效时 `appliedMin = null`（ECharts 不设 `min`，`scale:false` 自动含 0）；手动且合法时把该数写进 `barOption` 的 `yAxis.min`，同时原样交给 `diagnoseBaseline`。诊断不看用户输入框里的文本，只看这个真正落图的 `appliedMin`，杜绝「只改界面文字、ECharts 另用一套轴」的问题。

### 判定规则（保守）

仅普通数值柱状图：图表类型为 `bar`、有有限 `yRange`、配置有效，且 `appliedMin` 是**有限正数**时判为风险（此时可见上界 ≥ 数据最大值 > 该正下界，0 必落在可见范围之外）。自动模式、起点 ≤ 0 判为无风险；散点 / 折线判为「不适用」；起点无效或被裁剪判为「配置无效」并退回自动、不谎报风险；无数据不产出虚假诊断。措辞统一为「可能夸大数值差异 / 建议核查纵轴起点 / 通常建议包含零基线」，不出现「造假 / 数据错误 / 证明具有误导性」。

### 诊断数据结构

`BaselineDiagnostic` 带 `ruleId`（`bar-zero-baseline`）、`appliesTo`、`status`（risk/clear/not-applicable/invalid-config/no-data）、`level`、`title`、`summary`、`axisStart`（`mode` + `appliedMin`）、`dataRange`、`impact`、`recommendation`、`configSource`（`chartConfig.yAxisStart`）、`yFieldLabel`。证据全部来自真实 `yRange` 与生效 `appliedMin`，无演示数据硬编码；`configSource` / `ruleId` 供 Day 8 修复定位复用，本轮不实现修复。

### 测试（414 → 456，新增 42 项，既有断言一项未删）

| 文件 | 数量 | 内容 |
| --- | --- | --- |
| `chartDiagnostics.test.ts`（新） | 15 | A 组风险识别 + B 组图表类型边界 |
| `chartConfig.test.ts` | +12 | `resolveYAxisStart`：合法 / 留空 / 非数值 / 溢出 / 裁剪 / 无数据 |
| `chartData.test.ts` | +3 | `yMin` 落到真实 `yAxis.min`；非有限被忽略；散点不套用 |
| `ChartLab.test.tsx` | +12 | C 状态联动 + D 回归：默认自动 / 95 报风险 / 回 0 消失 / 回自动 / 99 与 abc 无效 / 负数不误报 / 切换散点折线不误用 / 换 CSV 清空 / 解析错误阻止诊断 / 聚合按真实结果 |

### 测试与构建结果（实际执行）

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | `Found 0 warnings and 0 errors.`（37 个文件，116 条规则） |
| `npm test` | `Test Files 13 passed (13)`，`Tests 456 passed (456)` |
| `npm run build` | `tsc -b && vite build` 成功，588 模块，297 ms；仍有既存 chunk > 500 kB 提示（Day 6 已有，未处理） |

### 浏览器验证（开发服务器 5173，真实 Chromium / CDP `evaluate_script`）

本机内置浏览器无可视表面（`viewport=0x0`、`visibilityState=hidden`），指针点击与 `take_screenshot` 返回 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`；因此交互用 `evaluate_script` 在真实页面派发 `click` / 原生 `input` 事件驱动 React，读回渲染后的 DOM 文本，非快照推断。

| 检查点 | 实测 |
| --- | --- |
| 加载「非零基线演示数据」→ 柱状图 | 标题「柱状图：按 group 逐条展示 value」，画布容器已挂载（`clientHeight 420`） |
| 默认自动 | 诊断「未发现风险」，文案「纵轴按自动范围绘制并包含 0…」，auto 单选选中 |
| 手动 95 | 诊断转「建议核查」，含「当前配置 Y 轴起点 = 95 / 数据范围 96 – 98 / 判断依据…不包含零基线 / 可能影响 / 建议」；输入框回声「当前纵轴起点：95（诊断依据与此一致）」 |
| 改回 0 | 状态回到「未发现风险」，回声显示 0 |
| 99 / abc / 留空 | 均为「配置无效」并给出对应中文错误，从不出现「柱状图非零基线」误报 |
| 切到散点（演示列仅 1 个数值） | 诊断面板不出现、给「请选择字段」空状态，绝不套用柱状图规则、不误报风险 |
| 切到折线再切回柱状图 | 手动起点保留、状态按真实范围正确刷新 |
| 换「体验示例数据」 | 回到新文件默认：auto 选中、手动输入框消失、起点残留清空 |

### 已知问题

- 演示数据从任务书建议的 2 行扩为 3 行（补 `C,97`）：`columnTypes` 的 `MIN_TYPE_SAMPLES = 3` 是 Day 4 的类型置信下限，2 行会让列被判为 `unknown` 而无法选轴、图也画不出来；A=96、B=98 数值不变，起点 95 仍触发风险、范围仍 96–98。
- 内置浏览器无视口：**未能**做像素级排版与 375 / 1280 / 1440 px 横向溢出核对，也未能读取真实 ECharts `getOption()` 的 `yAxis.min`（`echarts` 未挂到 `window`）；「输入 = ECharts 轴」由 `chartData.test.ts` 与 `ChartLab.test.tsx` 断言覆盖，浏览器只验证到诊断面板这一侧。
- 本轮只做「检测 / 证据 / 解释 / 建议」，一键修复、前后对比、撤销留待 Day 8；面板没有放任何不可用的修复按钮。

### 是否需要人工验收

需要：① 真实浏览器下演示数据的纵轴是否确按 95 抬高（本轮无法截图确认，仅代码与测试层面一致）；② 375 / 1280 / 1440 px 面板与图表排版的肉眼检查；③ 风险措辞与建议是否符合预期、是否需要更克制。

### 下一步（未开工，等你确认）

Day 8：基于本轮 `ruleId` / `configSource` / `appliedMin` 做「一键把起点恢复零基线 → 前后对比 → 撤销」；不在本轮范围。Day 7 到此停止，等待 ChatGPT 审查。



只修三个已确认的问题，不开发 Day 7。三处改动都落在「已验证的数值必须和显示一致」这条原则上：文案不能和解析规则相反，`0099` 不能被悄悄读成 `1999`，`1e308` 这类合法有限数值不能因为一次中间求和溢出就被说成无效数据。

### 修改文件

- 修改：`src/components/ChartLab.tsx`（提示文案；分组明细拆「可画柱」与「不可表示柱」两块；新增 `chart-overflow-note`）
- 修改：`src/lib/chartData.ts`（`utcEpochMs()`、`formatTimeTick` 年宽补零；`compensatedTotal()` / `reduceValues()`；`CategoryGroup.representable`、`ChartDataResult.overflowGroups`、`ChartScopeSummary.overflowNote`）
- 修改：`src/lib/chartData.test.ts`（82 → 102 项）、`src/components/ChartLab.test.tsx`（48 → 51 项）
- 未新增依赖，未改动解析、质量诊断、`columnTypes.ts`、`EChartCanvas.tsx`、容器与路由

### 修复 1：折线图日期提示「年在后」→「年在前」

`ChartLab.tsx` 的提示原本写「年在后」，而 `columnTypes.ts` 的 `DATE_SHAPE` 只接受 `YYYY-MM-DD`（年在前），说明文字与实际支持的写法相反。现改为「折线图 X 轴使用日期字段（年在前、能定位到具体日期的写法，如 2026-03-02）。」。

排查其他文案：`ChartLab.tsx` 里原本只出现这一处「年在后」；`chartData.ts` 是 `2026/3/2` 这种示例写法、`format.ts` / `columnTypes.ts` / `csv.ts` 没有年序描述，`docs/ACCEPTANCE.md` 无同类表述，无第二处需要改。新增一条渲染级断言（提示含「年在前」、不含「年在后」）。

### 修复 2：`Date.UTC` 对 0–99 年的补年特例

ECMAScript 规定 `Date.UTC(0..99, ...)` 先把年份补成 `1900..1999`，所以 `0099-02-28` 会被静默挪到 1999-02-28，同一列里 `0099` 与 `1999` 的两行还会挤到同一时刻。新增 `utcEpochMs()`：从 UTC 纪元的 `new Date(0)` 出发用 `setUTCFullYear` / `setUTCHours` 显式设置，`setUTCFullYear` 不触发补年规则，年份逐位对应输入。

- 形态与日历合法性判定完全没动（仍走 `splitIsoDate` + `isCalendarValidDate`，`0000-*` 照旧 `invalidDate`、`0099-02-29` 非闰、`0400-02-29` 闰、`0099-03` 仍按月粗粒度）
- 仍是纯 UTC 口径，没有引入本地时区
- `formatTimeTick` 的年份改成 `pad(getUTCFullYear(), 4)`，早年份刻度不会显示成 `99-12-31`
- 回归测试覆盖 `0001 / 0099 / 0100 / 2026`：逐位对应 + ISO 回环、`0099-12-31 + 1 天 = 0100-01-01`、`0099 ≠ Date.UTC(1999,…)`、现代日期与 `Date.UTC` 完全一致、`1999-12-31` 与 `0099-12-31` 在折线图里是两个不同时刻（按时间升序 treated 在前）

### 修复 3：分类聚合的求和溢出

`1e308 + 1e308` 直接得 `Infinity`，原实现把它同时喂给合计与平均值，平均值也跟着溢出。改成两级计算：

- `compensatedTotal()`：Neumaier 补偿求和，`1 + 1e308 - 1e308` 这类正负抵消能拿回真实的 `1`（朴素 `reduce` 给 `-1`，原实现给 `0`——这两个错误值现在都有断言挡着）
- `reduceValues()`：先按原始量级求和；结果为 `Infinity` 时改用「先除以组内最大绝对值 `scale`、归一化后补偿求和、再乘回」，合计为 `normalized × scale`（溢出就是溢出，如实保留 `Infinity`），平均值为 `scale × (normalized / n)`——`|normalized| ≤ n`，所以平均值必定有限、且等于有限原值的平均
- 只有 `Infinity` 才走归一化分支，普通数据的平均值/合计仍走原来的计算路径，逐值不变
- 不可表示的组不再进数据点：`CategoryGroup.representable = false` → 落入新字段 `overflowGroups`，`groups` / `points` 只含有限值，`series.data` 里不会出现 `NaN` 或 `Infinity`；合计口径下这根柱子不画并写明「合计无法有限表示」，平均值口径照常画 `1e308`
- 归类严格分开：不可表示组的记录仍算 `validCount`，不进 `invalidExcluded` / `missingExcluded` / `nonFinite`，也不参与 `capHidden`；`hiddenCategoryCount` 只统计「能画但撞上 100 类展示上限」的类别。措辞由 `overflowNote`（新）与 `capNote` 分别承担，两者不再互相冒充
- 原始记录、样本数 `n` 与来源行号在溢出组的明细里照旧保留（`samples` 改为深拷贝，明细行号最多逐条列 6 个、条数按全组算）

### 测试与构建结果（实际执行）

| 命令 | 实际结果 |
| --- | --- |
| `node_modules/vitest/vitest.mjs run src/components/ChartLab.test.tsx` | `Test Files 1 passed (1)`，`Tests 51 passed (51)`，3.86 s |
| `node_modules/vitest/vitest.mjs run`（即 `npm test`） | `Test Files 12 passed (12)`，`Tests 414 passed (414)`，13.14 s（文档改完后复跑 12.34 s，同为全绿）——原有 391 项全部仍通过，新增 23 项（`chartData.test.ts` +20、`ChartLab.test.tsx` +3） |
| `node_modules/oxlint/bin/oxlint`（即 `npm run lint`） | `Found 0 warnings and 0 errors.`（35 个文件，116 条规则，33 ms；复跑 32 ms 仍 0/0） |
| `node_modules/typescript/bin/tsc -b` | 无输出，退出码 0 |
| `node_modules/vite/bin/vite.js build`（配合上一步 = `npm run build`） | `✓ 587 modules transformed`、`✓ built in 344ms`；`index.html 0.69 kB`、`index-BXT9zd3Q.css 24.41 kB (gzip 5.66)`、`index-Bo56GICY.js 819.50 kB (gzip 268.71)`（文档改完后复跑 303 ms，产物哈希与体积一致） |

本机 `node` 不在 PATH 上，因此上面几条是直接调用 `node_modules` 里的入口（与 `npm run test/lint/build` 等价），不是把 `npm run …` 跑成功了的声称。构建仍有一条既存的 chunk > 500 kB 提示（Day 6 已有，本轮未处理）。

新增 23 项的分布：日期文案 1 项（渲染级）；早年份 5 项（逐位对应、不等于 1999、跨到 0100、现代日期与 `Date.UTC` 一致、日历规则不变、折线图端到端含刻度）；聚合数值 8 项（`1e308` 平均/合计、负数 `-1e308`/`-Infinity`、`Number.MAX_VALUE`、`1.5e308` 混合、三种顺序的正负抵消、普通数据逐值不变）；端到端 8 项（不画柱但记录有效、样本与行号保留、`series.data` 全有限、平均值口径照样画、121 类时的上限/触顶/不可表示分账、原始模式不受影响、文案不把溢出说成类型不符或触顶、无溢出时不出现提示）。

内置植物样例的结果未变：12 条记录、10 条有效、2 条缺失，control 平均 `13.14`、treated 平均 `26.44`，折线图仍是 10 条有效观测——这些既有断言在本轮全绿。

### 已知问题

- 合计口径下溢出组仍会先算出一个 `Infinity` 合计再判定不画；`overflowNote` 只保证不把 `Infinity` 传给 ECharts，没有替用户改写这个数学事实。
- 归一化分支的平均值写成 `scale × (normalized / n)`，`normalized` 是除以 `scale` 之后的补偿和，因此极端大数之间求平均可能损失最后一两位精度；本轮实测样例仍落在精确值上，测试对这类结果用 `toBeCloseTo` 而不是逐位相等。
- 溢出判定按「结果是否有限」二分类，不区分「刚好触顶 `MAX_VALUE`」与「真正不可表示」；`Number.MAX_VALUE + Number.MAX_VALUE` 归入后者（合计）符合 IEEE754 结果，但不是「数据坏了」。
- 溢出文案与「不画这根柱子」只在 jsdom 里断言过 DOM 文本，没有做真实浏览器可视验证（本轮未起开发服务器、没有截图），琥珀色区块在真实宽度下的排版仍需人工过一眼。
- 未做真实浏览器的可视化验证（本轮不需要），极端大数的柱高在 ECharts 里仍是一条拉到顶的柱子——它没有进 `Infinity`，但视觉上与 `1e5` 级别的柱子无法比较，这一点没有额外提示。

### 是否需要人工验收

需要：① 「年在前」这句提示的措辞是否符合你的表述习惯；② 合计无法有限表示时「不画这根柱子 + 琥珀色明细」是否比「画到顶并标注」更好；③ 不可表示组的记录数是否要在总量说明里再单独给一行数字（当前写在描述末尾与琥珀色区块两处）。

### 下一步（未开工，等你确认）

Day 6 到此停止，等待最终验收。Day 7 候选（尚未授权）：图表表达诊断、修复建议与撤销、导出。本轮未提交 Git、未推送、未发布站点；`.scratch/` 下的临时探测脚本已删除，工作区只剩本轮的 4 个源码/测试文件改动与本文件。
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
