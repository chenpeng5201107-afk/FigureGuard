# FigureGuard 开发进度

赛道：2026 Qoder 高校创造力大赛 · StudyHack　　周期：14 天　　开发者：单人

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
