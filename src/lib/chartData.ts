import { classifyCellValue, isCalendarValidDate, parseDateParts } from './columnTypes';
import { formatComputedValue, formatCount } from './format';
import type { CategoryAggregation, ChartKind } from '../types/chart';
import type { CsvCellValue, CsvTable } from '../types/csv';
import type { ColumnTypeProfile, ColumnTypeSummary } from '../types/dataQuality';

/**
 * 图表数据适配核心：把 `CsvTable` + 字段下标 + 图表类型 + 聚合口径转换成可绘制的数据与真实统计。
 * 只读原始数据，不写回、不排序、不填充、不删除；聚合一律生成新对象。
 */

/** 坐标轴在当前图表里的角色：类别轴只判缺失，数值轴还要判数值形态与有限性，时间轴判能否定位到时间点。 */
export type AxisRole = 'category' | 'number' | 'time';

/** 单图展示上限：避免几十万条记录把浏览器绘图元素堆爆。 */
export const BAR_DISPLAY_CAP = 100;
export const SCATTER_DISPLAY_CAP = 2000;
export const LINE_DISPLAY_CAP = 2000;

/** tooltip 与分组说明里逐条列出的原始行号上限；总量始终按全组真实数量统计。 */
export const MAX_ITEMIZED_SOURCE_ROWS = 10;

/** 品牌青绿（与 index.css 的 --color-brand 一致）。 */
export const BRAND_COLOR = '#0d9488';

/** 画布轴标题的可容纳字符数：X 轴横向、Y 轴纵向，完整文本由页面说明给出。 */
const CANVAS_X_NAME_CHARS = 18;
const CANVAS_Y_NAME_CHARS = 22;

/** 一天的毫秒数（UTC 下恒定，不受夏令时影响），用于把时间轴刻度对齐到整天。 */
const DAY_MS = 24 * 60 * 60 * 1000;
/** 时间轴最多切成几段：间隔再按整天向上取整，保证刻度落在真实日期上。 */
const TIME_TICK_DAYS = 6;

export interface ChartFieldChoice {
  /** 原始列下标（0 基，不用列名当唯一 ID，避免重复表头串列）。 */
  index: number;
  /** 界面显示名。 */
  label: string;
}

/** 被排除记录的原因分类，每个被排除的记录只归一类、只计一次。 */
export interface ExcludedReasonCounts {
  /** 单元格为 null：该行字段数少于表头，结构性缺列。 */
  structuralNull: number;
  /** 单元格为空字符串。 */
  empty: number;
  /** 单元格只有空白字符。 */
  whitespace: number;
  /** 有内容但不是纯数值形态（如 `12kg`、`abc`）。 */
  nonNumericText: number;
  /** 是数值形态但无法有限表示（如 `1e999` → Infinity）。 */
  nonFinite: number;
  /** 时间轴专用：形态像日期但日历上不存在（如 `2026-02-30`、`2026-13-01`）。 */
  invalidDate: number;
  /** 时间轴专用：不是年在前的无时区偏移写法（如 `03/02/2026`、`2026-03-02T08:15:00+08:00`）。 */
  nonDateText: number;
  /** 时间轴专用：只到年月，精度不足以定位具体日期（如 `2026-03`），不会补成某月第一天。 */
  coarseDate: number;
}

type MissingKind = keyof Pick<ExcludedReasonCounts, 'structuralNull' | 'empty' | 'whitespace'>;
type InvalidKind = keyof Pick<
  ExcludedReasonCounts,
  'nonNumericText' | 'nonFinite' | 'invalidDate' | 'nonDateText' | 'coarseDate'
>;

/** 一个展示单元背后的原始有效记录，保留行号与单元格原文，供 tooltip、报告与 Day 7 证据追溯。 */
export interface ChartSourceRef {
  rowIndex: number;
  rawX: string;
  rawY: string;
}

export interface ChartPoint {
  /** 追溯用的第一条原始数据行下标（0 基，不含表头）；聚合点为组内首条。 */
  rowIndex: number;
  /** 散点图的真实 X 数值、折线图的 UTC 毫秒时间戳；柱状图类别轴为 null。 */
  xValue: number | null;
  /** Y 轴数值：原始记录是 CSV 里的值，聚合结果是完整精度的计算值。 */
  yValue: number;
  /** 柱状图类别轴标签（原始记录模式下重复类别附数据行号）；散点图与折线图为空串。 */
  axisLabel: string;
  /** X 轴单元格原文（未裁剪）；聚合点为分组键。 */
  rawX: string;
  /** Y 轴单元格原文（未裁剪）；聚合点没有单一原文，为空串，逐条原文见 sources。 */
  rawY: string;
  /** 该展示单元背后的全部有效原始记录：逐条模式恰为 1 条，聚合模式为该组全部样本。 */
  sources: ChartSourceRef[];
}

/** 参与聚合的单条有效样本。 */
export interface CategorySample {
  rowIndex: number;
  /** 分组键：X 轴单元格去掉首尾空白后的原文，区分大小写。 */
  category: string;
  /** 参与计算的数值（完整精度）。 */
  value: number;
  /** 该数值的 CSV 原文。 */
  rawValue: string;
}

/** 一个类别的聚合结果。 */
export interface CategoryGroup {
  key: string;
  /** 完整精度聚合值：平均值 = 组内和 / 样本数，求和 = 组内累加，都不做四舍五入。 */
  value: number;
  /** 组内首条记录的原始行下标。 */
  firstRowIndex: number;
  /** 组内全部有效样本，按上传顺序。 */
  samples: CategorySample[];
}

export interface ChartDataResult {
  kind: ChartKind;
  /** 实际生效的聚合口径；散点图与折线图恒为 `raw`。 */
  aggregation: CategoryAggregation;
  /** 当前图表类型的展示上限（聚合柱状图按类别组数计）。 */
  cap: number;
  /** 原始记录总数（整份数据集，不受表格 50 行分页影响）。 */
  rawTotal: number;
  /** 符合当前 X/Y 要求的有效记录数（始终按记录统计，不与类别数混淆）。 */
  validCount: number;
  /** 因缺失值（空 / 空白 / 结构性缺列）排除的记录数。 */
  missingExcluded: number;
  /** 因类型不符（非数值、非有限、无法定位时间）排除的记录数。 */
  invalidExcluded: number;
  /** 实际进入图表的展示单元数量：柱子 / 散点 / 折线观测点个数。 */
  displayedCount: number;
  /** 有效但因展示上限未显示的**记录**数（聚合模式为该口径下未成柱类别组包含的记录数）。 */
  capHidden: number;
  /** 聚合模式的类别组总数（全量，不受上限影响）；其他模式为 null。 */
  categoryTotal: number | null;
  /** 聚合模式下因展示上限没有成柱的类别组数；其他模式为 0。 */
  hiddenCategoryCount: number;
  /** 排除原因细分；各子类之和与 missingExcluded / invalidExcluded 分别守恒。 */
  excludedReasons: ExcludedReasonCounts;
  /** 展示用的点（已按上限截断）。 */
  points: ChartPoint[];
  /** 聚合模式的分组结果（已按上限截断，按首次出现顺序）；其他模式为空数组。 */
  groups: CategoryGroup[];
  /** 图中实际绘制点的 Y 数值范围（Day 7 轴起点规则需要它）；没有点时为 null。 */
  yRange: { min: number; max: number } | null;
  /** 折线图绘制点的时间跨度（UTC 毫秒）；其他图为 null。 */
  timeRange: { min: number; max: number } | null;
}

type CellState = 'missing' | 'invalid' | 'valid';

interface CellEvaluation {
  state: CellState;
  /** 数值轴的数值，或时间轴的 UTC 毫秒。 */
  value?: number;
  missingKind?: MissingKind;
  invalidKind?: InvalidKind;
}

export type TimeCellEvaluation =
  | { state: 'valid'; epochMs: number }
  | { state: 'missing'; missingKind: MissingKind }
  | { state: 'invalid'; invalidKind: 'invalidDate' | 'nonDateText' | 'coarseDate' };

function isWhitespaceOnly(text: string): boolean {
  return text !== '' && text.trim() === '';
}

/**
 * 时间轴取值判定。
 *
 * - 复用 `columnTypes` 的年在前后日期形态与日历校验，不另写一套判断规则，也不依赖有地区歧义的 `Date.parse()`。
 * - 只接受能定位到**具体日期**的写法：`2026-03` 这类年月精度不足直接排除，绝不悄悄补成 3 月 1 日。
 * - 一律按 UTC 解释（`Date.UTC`）：时间戳只用于排序与刻度定位，浏览器时区不会让日期偏移一天。
 * - 带时区偏移（`Z` / `+08:00`）的写法当前不被现有日期形态接受，按「不是支持的日期写法」排除并说明。
 */
export function parseTimeCell(cell: CsvCellValue): TimeCellEvaluation {
  if (cell === null) return { state: 'missing', missingKind: 'structuralNull' };
  if (cell === '') return { state: 'missing', missingKind: 'empty' };
  if (isWhitespaceOnly(cell)) return { state: 'missing', missingKind: 'whitespace' };

  const text = cell.trim();
  const parts = parseDateParts(text);
  if (parts === null) return { state: 'invalid', invalidKind: 'nonDateText' };
  if (!isCalendarValidDate(text)) return { state: 'invalid', invalidKind: 'invalidDate' };
  if (parts.day === null) return { state: 'invalid', invalidKind: 'coarseDate' };

  const epochMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  if (!Number.isFinite(epochMs)) return { state: 'invalid', invalidKind: 'invalidDate' };
  return { state: 'valid', epochMs };
}

/**
 * 单元格取值判定，只看内容形态不做任何改写。
 * 数值先要求命中现有 NUMBER_SHAPE（classifyCellValue 的 number + plain-number），
 * 再用 Number() 转换并通过 Number.isFinite 检查，杜绝 `1e999` / `Infinity` / `12kg` 混入。
 * category 轴只区分缺失与有效：任何非空文本都是合法类别标签。
 */
function evaluateCell(cell: CsvCellValue, role: AxisRole): CellEvaluation {
  if (cell === null) return { state: 'missing', missingKind: 'structuralNull' };
  if (cell === '') return { state: 'missing', missingKind: 'empty' };
  if (isWhitespaceOnly(cell)) return { state: 'missing', missingKind: 'whitespace' };

  if (role === 'category') return { state: 'valid' };

  if (role === 'time') {
    const time = parseTimeCell(cell);
    if (time.state === 'valid') return { state: 'valid', value: time.epochMs };
    if (time.state === 'missing') return { state: 'missing', missingKind: time.missingKind };
    return { state: 'invalid', invalidKind: time.invalidKind };
  }

  const vote = classifyCellValue(cell);
  if (vote === null || vote.kind !== 'number' || vote.shape !== 'plain-number') {
    return { state: 'invalid', invalidKind: 'nonNumericText' };
  }
  const parsed = Number(cell.trim());
  if (!Number.isFinite(parsed)) return { state: 'invalid', invalidKind: 'nonFinite' };
  return { state: 'valid', value: parsed };
}

function capOf(kind: ChartKind): number {
  if (kind === 'bar') return BAR_DISPLAY_CAP;
  if (kind === 'line') return LINE_DISPLAY_CAP;
  return SCATTER_DISPLAY_CAP;
}

/**
 * 按类别聚合，纯函数：输入逐条有效样本，输出一组新对象。
 *
 * - 分组键是类别文本本身（上游已去掉首尾空白），大小写不同、空格位置不同的写法视为不同类别，绝不跨类别合并。
 * - 组顺序按该类别第一次出现的顺序，与上传顺序一致，重复计算结果完全相同。
 * - 平均值 = 组内累加 / 组内**有效**样本数；缺失与无效记录在上游已被排除，不进入分子也不进入分母。
 * - 0、负数与合法小数照常参与计算；结果保留完整精度，缩略小数只发生在展示文本上。
 * - 不合并、不删除、不排序原始记录，误差棒与显著性一概不生成。
 */
export function aggregateByCategory(
  samples: readonly CategorySample[],
  method: Extract<CategoryAggregation, 'mean' | 'sum'>,
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const indexByKey = new Map<string, number>();
  const sums = new Map<string, number>();

  for (const sample of samples) {
    let groupIndex = indexByKey.get(sample.category);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      indexByKey.set(sample.category, groupIndex);
      sums.set(sample.category, 0);
      groups.push({ key: sample.category, value: 0, firstRowIndex: sample.rowIndex, samples: [] });
    }
    const group = groups[groupIndex];
    // 组内存副本：聚合结果与调用方传入的样本对象不再共享引用，后续步骤改不到原始记录。
    group.samples.push({ ...sample });
    sums.set(sample.category, (sums.get(sample.category) ?? 0) + sample.value);
  }

  for (const group of groups) {
    const total = sums.get(group.key) ?? 0;
    group.value = method === 'mean' ? total / group.samples.length : total;
  }
  return groups;
}

interface ValidEntry {
  rowIndex: number;
  rawX: string;
  rawY: string;
  /** 柱状图的分组键（X 原文去掉首尾空白）。 */
  category: string;
  /** 散点图 X 数值。 */
  xValue: number | null;
  /** 折线图时间戳（UTC 毫秒）。 */
  time: number | null;
  yValue: number;
}

function byTimeThenRow(a: ValidEntry, b: ValidEntry): number {
  // 同一时间点的记录按上传顺序排列（稳定排序不合并、不平均、不去重）。
  return (a.time ?? 0) - (b.time ?? 0) || a.rowIndex - b.rowIndex;
}

function aggregatePointOf(group: CategoryGroup): ChartPoint {
  return {
    rowIndex: group.firstRowIndex,
    xValue: null,
    yValue: group.value,
    axisLabel: group.key,
    rawX: group.key,
    rawY: '',
    sources: group.samples.map((sample) => ({
      rowIndex: sample.rowIndex,
      rawX: sample.category,
      rawY: sample.rawValue,
    })),
  };
}

/**
 * 把 CsvTable + 字段下标 + 图表类型 + 聚合口径转换成 ECharts 可用的数据与排除统计。
 *
 * 约束：
 * - 只读 `table.rows`，不改写任何原始单元格；聚合结果全部是新对象；
 * - 遍历完整数据集（`table.recordCount`），与表格 50 行分页无关；
 * - 每条记录只归入有效 / 缺失 / 无效三者之一，缺失优先于无效，保证「只计一次」；
 * - 原始记录模式的重复类别附数据行号保证标签唯一，多条记录不会被错误合并；
 * - 聚合模式按类别组截断，整组要么成柱要么整组不显示，不会因为视觉截断把不同类别并到一起。
 *
 * xIndex / yIndex 必须是已通过字段适配校验的合法列下标，UI 在此之前先走空状态。
 */
export function computeChartData(
  table: CsvTable,
  kind: ChartKind,
  xIndex: number,
  yIndex: number,
  aggregation: CategoryAggregation = 'raw',
): ChartDataResult {
  const rawTotal = table.recordCount;
  const cap = capOf(kind);
  const roleX: AxisRole = kind === 'bar' ? 'category' : kind === 'line' ? 'time' : 'number';
  const effectiveAggregation: CategoryAggregation = kind === 'bar' ? aggregation : 'raw';

  const excludedReasons: ExcludedReasonCounts = {
    structuralNull: 0,
    empty: 0,
    whitespace: 0,
    nonNumericText: 0,
    nonFinite: 0,
    invalidDate: 0,
    nonDateText: 0,
    coarseDate: 0,
  };

  // 第一趟：逐条判定，收集有效记录（带原始文本、分组键、数值或时间戳）。
  const validRows: ValidEntry[] = [];
  let missingExcluded = 0;
  let invalidExcluded = 0;

  for (let rowIndex = 0; rowIndex < rawTotal; rowIndex += 1) {
    const row = table.rows[rowIndex];
    const xEval = evaluateCell(row[xIndex], roleX);
    const yEval = evaluateCell(row[yIndex], 'number');

    // 缺失优先：任一必需轴缺失即记为缺失（取第一个缺失的轴，保证只计一次）。
    if (xEval.state === 'missing' || yEval.state === 'missing') {
      const cause = xEval.state === 'missing' ? xEval : yEval;
      if (cause.missingKind) excludedReasons[cause.missingKind] += 1;
      missingExcluded += 1;
      continue;
    }
    if (xEval.state === 'invalid' || yEval.state === 'invalid') {
      const cause = xEval.state === 'invalid' ? xEval : yEval;
      if (cause.invalidKind) excludedReasons[cause.invalidKind] += 1;
      invalidExcluded += 1;
      continue;
    }

    validRows.push({
      rowIndex,
      rawX: row[xIndex] ?? '',
      rawY: row[yIndex] ?? '',
      category: kind === 'bar' ? (row[xIndex] ?? '').trim() : '',
      xValue: roleX === 'category' ? null : xEval.value ?? 0,
      time: kind === 'line' ? xEval.value ?? 0 : null,
      yValue: yEval.value ?? 0,
    });
  }

  const orderedRows = kind === 'line' ? [...validRows].sort(byTimeThenRow) : validRows;
  const aggregated = effectiveAggregation !== 'raw';

  let points: ChartPoint[];
  let groups: CategoryGroup[] = [];
  let categoryTotal: number | null = null;
  let hiddenCategoryCount = 0;
  let usedRecords: number;

  if (aggregated) {
    const allGroups = aggregateByCategory(
      validRows.map<CategorySample>((entry) => ({
        rowIndex: entry.rowIndex,
        category: entry.category,
        value: entry.yValue,
        rawValue: entry.rawY,
      })),
      effectiveAggregation === 'sum' ? 'sum' : 'mean',
    );
    categoryTotal = allGroups.length;
    groups = allGroups.slice(0, cap);
    hiddenCategoryCount = allGroups.length - groups.length;
    points = groups.map(aggregatePointOf);
    usedRecords = groups.reduce((sum, group) => sum + group.samples.length, 0);
  } else {
    const displayed = orderedRows.slice(0, cap);
    usedRecords = displayed.length;

    // 只在展示集合内做类别唯一化：统计该类别在展示点里出现的次数。
    const categoryCounts = new Map<string, number>();
    if (kind === 'bar') {
      for (const entry of displayed) categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
    }

    // 类别标签唯一化：先按展示顺序逐个分配，冲突时退到带数据行号的形态，仍冲突就继续追加计数，
    // 直到该标签未被使用过才落地，保证任意类别文本组合下展示集合内都不会重名。
    const usedLabels = new Set<string>();
    const assignLabel = (preferred: string, rowScoped: string): string => {
      let label = preferred;
      if (usedLabels.has(label)) {
        label = rowScoped;
        for (let bump = 2; usedLabels.has(label); bump += 1) label = `${rowScoped} (${bump})`;
      }
      usedLabels.add(label);
      return label;
    };

    points = displayed.map((entry) => {
      let axisLabel = '';
      if (kind === 'bar') {
        const rowScoped = `${entry.category} #${entry.rowIndex + 1}`;
        // 重复类别直接用「类别 #数据行号」；只出现一次的类别保留原文，必要时同样升级消歧。
        const duplicated = (categoryCounts.get(entry.category) ?? 0) > 1;
        axisLabel = assignLabel(duplicated ? rowScoped : entry.category, rowScoped);
      }
      return {
        rowIndex: entry.rowIndex,
        xValue: entry.xValue,
        yValue: entry.yValue,
        axisLabel,
        rawX: entry.rawX,
        rawY: entry.rawY,
        sources: [{ rowIndex: entry.rowIndex, rawX: entry.rawX, rawY: entry.rawY }],
      };
    });
  }

  const yValues = points.map((point) => point.yValue);
  const times = kind === 'line' ? points.map((point) => point.xValue ?? 0) : [];

  return {
    kind,
    aggregation: effectiveAggregation,
    cap,
    rawTotal,
    validCount: validRows.length,
    missingExcluded,
    invalidExcluded,
    displayedCount: points.length,
    capHidden: validRows.length - usedRecords,
    categoryTotal,
    hiddenCategoryCount,
    excludedReasons,
    points,
    groups,
    yRange: yValues.length === 0 ? null : { min: Math.min(...yValues), max: Math.max(...yValues) },
    timeRange: times.length === 0 ? null : { min: Math.min(...times), max: Math.max(...times) },
  };
}

/** 类别轴候选：文本或类别字段（含标识符列，如 `group`；日期与无法确定不在类别轴里）。 */
export function categoryFieldChoices(columnTypes: ColumnTypeSummary): ChartFieldChoice[] {
  return columnTypes.columns
    .filter((profile: ColumnTypeProfile) => profile.kind === 'text')
    .map((profile) => ({ index: profile.index, label: profile.label }));
}

/** 数值轴候选：数值字段（标识符与前导零编号已被判为文本，不会出现在这里）。 */
export function numericFieldChoices(columnTypes: ColumnTypeSummary): ChartFieldChoice[] {
  return columnTypes.columns
    .filter((profile: ColumnTypeProfile) => profile.kind === 'number')
    .map((profile) => ({ index: profile.index, label: profile.label }));
}

/** 时间轴候选：字段类型推断判为日期的列，与 `columnTypes` 的日历校验完全同一套规则。 */
export function dateFieldChoices(columnTypes: ColumnTypeSummary): ChartFieldChoice[] {
  return columnTypes.columns
    .filter((profile: ColumnTypeProfile) => profile.kind === 'date')
    .map((profile) => ({ index: profile.index, label: profile.label }));
}

/** 按图表类型给出对应轴的候选字段。 */
export function fieldChoicesForAxis(columnTypes: ColumnTypeSummary, kind: ChartKind, axis: 'x' | 'y'): ChartFieldChoice[] {
  if (kind === 'scatter') return numericFieldChoices(columnTypes);
  if (axis === 'x') return kind === 'line' ? dateFieldChoices(columnTypes) : categoryFieldChoices(columnTypes);
  return numericFieldChoices(columnTypes);
}

export interface DefaultSelection {
  x: number | null;
  y: number | null;
  /** 该类图是否有足够的可用字段可默认选中。 */
  ready: boolean;
}

/**
 * 默认字段选择：
 * - 柱状图 X 优先选非标识符的文本字段（示例里即 `group`，跳过 `sample_id`），没有再退回首个文本字段；Y 选首个数值字段。
 * - 散点图 X/Y 选前两个不同的数值字段，不足两个则不可用。
 * - 折线图 X 选首个日期字段，Y 选首个数值字段。
 */
export function defaultSelection(columnTypes: ColumnTypeSummary, kind: ChartKind): DefaultSelection {
  const categories = categoryFieldChoices(columnTypes);
  const numbers = numericFieldChoices(columnTypes);

  if (kind === 'scatter') {
    if (numbers.length < 2) return { x: null, y: null, ready: false };
    return { x: numbers[0].index, y: numbers[1].index, ready: true };
  }

  if (kind === 'line') {
    const dates = dateFieldChoices(columnTypes);
    if (dates.length === 0 || numbers.length === 0) return { x: null, y: null, ready: false };
    return { x: dates[0].index, y: numbers[0].index, ready: true };
  }

  const nonIdentifier = columnTypes.columns
    .filter((profile) => profile.kind === 'text' && !profile.identifierHeader)
    .map((profile) => ({ index: profile.index }));
  const preferredCategory = nonIdentifier.length > 0 ? nonIdentifier[0].index : categories.length > 0 ? categories[0].index : null;
  const preferredNumber = numbers.length > 0 ? numbers[0].index : null;

  return {
    x: preferredCategory,
    y: preferredNumber,
    ready: preferredCategory !== null && preferredNumber !== null,
  };
}

export interface AxisFieldSelection {
  x: number | null;
  y: number | null;
}

/**
 * 切换图表类型后的字段选择协调：同一根轴上原字段仍然是合法候选就保留（例如柱状图换散点图时 Y 不变），
 * 否则退回该类图的默认选择；散点图还要保证 X 与 Y 不是同一个字段。
 */
export function resolveFieldsForKind(
  columnTypes: ColumnTypeSummary,
  kind: ChartKind,
  current: AxisFieldSelection,
): AxisFieldSelection {
  const nextDefault = defaultSelection(columnTypes, kind);
  const xOptions = fieldChoicesForAxis(columnTypes, kind, 'x');
  const yOptions = fieldChoicesForAxis(columnTypes, kind, 'y');

  const keptX = current.x !== null && xOptions.some((choice) => choice.index === current.x) ? current.x : nextDefault.x;
  let keptY = current.y !== null && yOptions.some((choice) => choice.index === current.y) ? current.y : nextDefault.y;

  if (kind === 'scatter' && keptX !== null && keptY === keptX) {
    const alternative = yOptions.find((choice) => choice.index !== keptX);
    keptY = alternative ? alternative.index : nextDefault.y;
  }
  return { x: keptX, y: keptY };
}

export interface ChartFieldStatus {
  ready: boolean;
  xChoiceCount: number;
  yChoiceCount: number;
  /** 不可用时的中文说明；可用时为 null。 */
  notice: string | null;
}

/** 该类图有没有可画的字段，以及没有时该怎么跟用户解释。 */
export function evaluateFieldAvailability(columnTypes: ColumnTypeSummary, kind: ChartKind): ChartFieldStatus {
  const xOptions = fieldChoicesForAxis(columnTypes, kind, 'x');
  const yOptions = fieldChoicesForAxis(columnTypes, kind, 'y');
  const needsTwoNumbers = kind === 'scatter';
  const ready = needsTwoNumbers ? yOptions.length >= 2 : xOptions.length >= 1 && yOptions.length >= 1;

  if (ready) return { ready: true, xChoiceCount: xOptions.length, yChoiceCount: yOptions.length, notice: null };

  if (needsTwoNumbers) {
    return {
      ready: false,
      xChoiceCount: xOptions.length,
      yChoiceCount: yOptions.length,
      notice: `散点图需要两个不同的数值字段，当前可用数值字段只有 ${formatCount(yOptions.length)} 个，无法成对绘制。`,
    };
  }
  if (kind === 'line') {
    return {
      ready: false,
      xChoiceCount: xOptions.length,
      yChoiceCount: yOptions.length,
      notice:
        xOptions.length === 0
          ? '没有可用作 X 轴的日期字段。折线图的 X 轴需要年在前、能定位到具体日期的写法（如 2026-03-02），Y 轴需要数值字段。'
          : '没有数值字段可作为折线图的 Y 轴，无法绘制时间序列。',
    };
  }
  return {
    ready: false,
    xChoiceCount: xOptions.length,
    yChoiceCount: yOptions.length,
    notice:
      xOptions.length === 0
        ? '没有可用作 X 轴的文本或类别字段。柱状图的 X 轴需要文本或类别字段、Y 轴需要数值字段。'
        : '没有数值字段可作为柱状图的 Y 轴，无法绘制高度类图表。',
  };
}

/** 转义 CSV 原文与用户填写的配置文本，供 tooltip 的 HTML 片段使用，避免注入。 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** 类别轴标签的视觉缩略：只显示前若干字符，tooltip 仍保留全文。 */
function truncateLabel(text: string, max = 12): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 数值显示：用原始文本回显更贴近 CSV，缺失时退回数值字符串。 */
function displayNumberCell(raw: string): string {
  return raw.trim() === '' ? '（空）' : raw;
}

const AGGREGATION_TOOLTIP_LABEL: Record<Extract<CategoryAggregation, 'mean' | 'sum'>, string> = {
  mean: '算术平均值（缺失与无效记录不进入分母）',
  sum: '求和（只对该列确实可加的指标有意义）',
};

function formatSourceRows(sources: readonly ChartSourceRef[]): string {
  const shown = sources.slice(0, MAX_ITEMIZED_SOURCE_ROWS).map((source) => formatCount(source.rowIndex + 1));
  const rest = sources.length - shown.length;
  return shown.join('、') + (rest > 0 ? `（另有 ${formatCount(rest)} 条，见下方分组说明）` : '');
}

/**
 * 依据 computeChartData 的结果生成 ECharts option。
 *
 * - 柱状图（原始记录）：类别轴唯一标签 + 数值轴不固定最小值，负值不被裁剪。
 * - 柱状图（聚合）：一个类别一根柱子，tooltip 说明类别、聚合方法、聚合值与样本数 n。
 * - 散点图：真实 X/Y 数值坐标，scale:true 避免为凑零而裁点；不生成趋势线。
 * - 折线图：X 轴按真实时间等距（UTC 毫秒数值轴 + 日期刻度文本），只连当前可用观测点，不平滑、不插值。
 * - 标题与单位只进入轴标注与说明文本，不改动任何数值；轴标题过长只缩略显示，tooltip 与页面说明保留全文。
 * - tooltip 用 formatter 闭包按 dataIndex 回查原始记录，并对 CSV 原文与用户输入转义。
 */
export function toEChartsOption(result: ChartDataResult, meta: ChartAxisMeta): Record<string, unknown> {
  if (result.kind === 'line') return lineOption(result, meta);
  if (result.kind === 'scatter') return scatterOption(result, meta);
  return barOption(result, meta);
}

export interface ChartAxisMeta {
  /** 字段名原文：tooltip 的键与系列名使用它，保证用户填写的标注不会被当成字段本身。 */
  xLabel: string;
  yLabel: string;
  /** 坐标轴上真正显示的标注（轴标题 + 单位）；省略时跟随字段名。 */
  xName?: string;
  yName?: string;
}

/** 轴标题在画布里的长度上限：X 轴横向、Y 轴纵向，可用宽度不同。 */
function xNameOf(label: string): string {
  return truncateLabel(label.trim(), CANVAS_X_NAME_CHARS);
}
function yNameOf(label: string): string {
  return truncateLabel(label.trim(), CANVAS_Y_NAME_CHARS);
}

function barOption(result: ChartDataResult, meta: ChartAxisMeta): Record<string, unknown> {
  const { points } = result;
  const aggregated = result.aggregation !== 'raw';
  const rotate = points.length > 10;
  const xName = xNameOf(meta.xName ?? meta.xLabel);
  const yName = yNameOf(meta.yName ?? meta.yLabel);

  return {
    backgroundColor: 'transparent',
    animation: !prefersReducedMotion(),
    // 有轴标题时留出左/下边距，否则轴标题会被画布裁掉（Day 5 的留白不足已在 SSR 检查里复现）。
    grid: {
      left: yName === '' ? 8 : 48,
      right: 16,
      top: 24,
      bottom: xName === '' ? 8 : rotate ? 64 : 44,
      containLabel: true,
    },
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const point = points[pickDataIndex(params)];
        if (!point) return '';
        if (!aggregated) {
          return [
            `数据行号：${formatCount(point.rowIndex + 1)}`,
            `类别：${escapeHtml(displayNumberCell(point.rawX))}`,
            `数值：${escapeHtml(displayNumberCell(point.rawY))}`,
          ].join('<br/>');
        }
        const method = result.aggregation === 'sum' ? 'sum' : 'mean';
        return [
          `类别：${escapeHtml(point.rawX)}`,
          `聚合方式：${AGGREGATION_TOOLTIP_LABEL[method]}`,
          `聚合值：${escapeHtml(formatComputedValue(point.yValue))}`,
          `有效样本数 n：${formatCount(point.sources.length)}`,
          `原始数据行号：${formatSourceRows(point.sources)}`,
        ].join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.axisLabel),
      name: xName,
      nameLocation: 'middle',
      nameGap: rotate ? 40 : 34,
      axisLabel: {
        interval: 0,
        hideOverlap: true,
        rotate: rotate ? 35 : 0,
        // Canvas 渲染的坐标轴标签是纯文本，不是 HTML：这里转义会把 `A&B` 显示成 `A&amp;B`。
        // 因此只做视觉缩略，原文里只可能有 `&`/`<`/`>` 需要保留的可读形式。
        formatter: (value: string) => truncateLabel(value),
      },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      name: yName,
      nameLocation: 'middle',
      nameGap: 26,
      // Day 7 的非零基线规则要看的是这里（不设固定 min、scale:false）与 result.yRange。
      scale: false,
    },
    series: [
      {
        type: 'bar',
        name: meta.yLabel,
        data: points.map((point) => point.yValue),
        itemStyle: { color: BRAND_COLOR },
      },
    ],
  };
}

function scatterOption(result: ChartDataResult, meta: ChartAxisMeta): Record<string, unknown> {
  const { points } = result;
  const xName = xNameOf(meta.xName ?? meta.xLabel);
  const yName = yNameOf(meta.yName ?? meta.yLabel);

  return {
    backgroundColor: 'transparent',
    animation: !prefersReducedMotion(),
    grid: { left: yName === '' ? 8 : 48, right: 24, top: 24, bottom: xName === '' ? 8 : 44, containLabel: true },
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const point = points[pickDataIndex(params)];
        if (!point) return '';
        return [
          `数据行号：${formatCount(point.rowIndex + 1)}`,
          `${escapeHtml(meta.xLabel)}：${escapeHtml(displayNumberCell(point.rawX))}`,
          `${escapeHtml(meta.yLabel)}：${escapeHtml(displayNumberCell(point.rawY))}`,
        ].join('<br/>');
      },
    },
    xAxis: { type: 'value', name: xName, nameLocation: 'middle', nameGap: 30, scale: true },
    yAxis: { type: 'value', name: yName, nameLocation: 'middle', nameGap: 26, scale: true },
    series: [
      {
        type: 'scatter',
        name: `${meta.xLabel} vs ${meta.yLabel}`,
        symbolSize: 9,
        data: points.map((point) => [point.xValue ?? 0, point.yValue]),
        itemStyle: { color: BRAND_COLOR },
      },
    ],
  };
}

/**
 * 把时间戳范围对齐到整天边界，并给出一个能落回 CSV 原始日期的等距间隔。
 * 不这么做的画，ECharts 会在两个观测点之间取形如「2026-03-01 21:20」的刻度，
 * 那是坐标轴算出来的合成时刻，CSV 里根本没有，会被误读成数据。
 */
function dayAlignedTimeAxis(timeRange: { min: number; max: number } | null): { min: number; max: number; interval: number } | null {
  if (!timeRange) return null;
  const minDay = Math.floor(timeRange.min / DAY_MS) * DAY_MS;
  let maxDay = Math.ceil(timeRange.max / DAY_MS) * DAY_MS;
  if (maxDay <= minDay) maxDay = minDay + DAY_MS;
  const daySpan = (maxDay - minDay) / DAY_MS;
  const intervalDays = Math.max(1, Math.ceil(daySpan / TIME_TICK_DAYS));
  return { min: minDay, max: maxDay, interval: intervalDays * DAY_MS };
}

function lineOption(result: ChartDataResult, meta: ChartAxisMeta): Record<string, unknown> {
  const { points } = result;
  const xName = xNameOf(meta.xName ?? meta.xLabel);
  const yName = yNameOf(meta.yName ?? meta.yLabel);
  const timeAxis = dayAlignedTimeAxis(result.timeRange);

  return {
    backgroundColor: 'transparent',
    animation: !prefersReducedMotion(),
    grid: { left: yName === '' ? 8 : 48, right: 16, top: 24, bottom: xName === '' ? 8 : 44, containLabel: true },
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const point = points[pickDataIndex(params)];
        if (!point) return '';
        return [
          `数据行号：${formatCount(point.rowIndex + 1)}`,
          `${escapeHtml(meta.xLabel)}：${escapeHtml(displayNumberCell(point.rawX))}`,
          `${escapeHtml(meta.yLabel)}：${escapeHtml(displayNumberCell(point.rawY))}`,
        ].join('<br/>');
      },
    },
    xAxis: {
      type: 'value',
      name: xName,
      nameLocation: 'middle',
      nameGap: 30,
      ...(timeAxis === null ? { scale: true } : timeAxis),
      // 时间戳刻度直接写成 UTC 日期文本，避免浏览器时区把刻度挪一天。
      axisLabel: { hideOverlap: true, formatter: (value: string | number) => formatTimeTick(Number(value)) },
    },
    yAxis: { type: 'value', name: yName, nameLocation: 'middle', nameGap: 26, scale: true },
    series: [
      {
        type: 'line',
        name: meta.yLabel,
        data: points.map((point) => [point.xValue ?? 0, point.yValue]),
        symbolSize: 7,
        showSymbol: true,
        // 只连接已有观测点：不平滑、不插值、不预测，缺失区间不会凭空出现第二个点。
        smooth: false,
        lineStyle: { color: BRAND_COLOR, width: 2 },
        itemStyle: { color: BRAND_COLOR },
      },
    ],
  };
}

/** 由 UTC 毫秒生成刻度文本：零点只显示日期，其余显示到时分。不用 Date.parse，也不读本地时区。 */
export function formatTimeTick(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '';
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  return hour === 0 && minute === 0 && second === 0 ? day : `${day} ${pad(hour)}:${pad(minute)}`;
}

export interface ChartScopeContext {
  /** X / Y 轴字段名原文。 */
  xLabel: string;
  yLabel: string;
  /** 生效的图表标题。 */
  title: string;
}

export interface ChartScopeSummary {
  /** 参与与排除数量的主句。 */
  headline: string;
  /** 读屏用的等价说明（含标题与字段）。 */
  description: string;
  /** 缺失 / 无效 / 时间三类原因的细分口径，只在有内容时出现。 */
  breakdown: string[];
  /** 聚合方式、分组规则、时间口径等计算方法说明。 */
  methodNotes: string[];
  /** 触顶说明；未触顶为 null。 */
  capNote: string | null;
}

/** 单位未确认时的固定提示：单位由用户确认，系统不猜。 */
export const UNITLESS_HINT = '未填写单位（单位需要你自己确认，系统不会猜测或换算）';

function rangeText(range: { min: number; max: number } | null): string {
  if (range === null) return '无（本图没有绘制任何数值）';
  return `${formatComputedValue(range.min)} – ${formatComputedValue(range.max)}`;
}

/**
 * 把统计结果整理成「这张图画了什么、怎么算的、哪些记录没参与」的中文口径说明。
 * 数字全部来自 computeChartData，这里只负责措辞，不新增任何判断或结论。
 */
export function summarizeChartScope(result: ChartDataResult, context: ChartScopeContext): ChartScopeSummary {
  const kindLabel = result.kind === 'bar' ? '柱状图' : result.kind === 'line' ? '折线图' : '散点图';
  const aggregated = result.aggregation !== 'raw';
  const breakdown: string[] = [];
  const methodNotes: string[] = [];

  const headline =
    `原始记录 ${formatCount(result.rawTotal)} 条；符合条件的有效记录 ${formatCount(result.validCount)} 条；` +
    `因缺失值排除 ${formatCount(result.missingExcluded)} 条；因类型不符或非有限数值排除 ${formatCount(result.invalidExcluded)} 条；` +
    (aggregated
      ? `本图按类别聚合后实际绘制 ${formatCount(result.displayedCount)} 根柱子（类别组共 ${formatCount(
          result.categoryTotal ?? 0,
        )} 组）。`
      : `本图实际展示 ${formatCount(result.displayedCount)} 个数据点。`);

  if (result.missingExcluded > 0) {
    breakdown.push(
      `缺失细分：空字符串 ${formatCount(result.excludedReasons.empty)} 条、只有空白字符 ${formatCount(
        result.excludedReasons.whitespace,
      )} 条、结构性缺列 ${formatCount(result.excludedReasons.structuralNull)} 条。`,
    );
  }
  if (result.excludedReasons.nonNumericText + result.excludedReasons.nonFinite > 0) {
    breakdown.push(
      `无效数值细分：非数值文本 ${formatCount(result.excludedReasons.nonNumericText)} 条、无法有限表示（如 1e999） ${formatCount(
        result.excludedReasons.nonFinite,
      )} 条。`,
    );
  }
  if (result.excludedReasons.invalidDate + result.excludedReasons.nonDateText + result.excludedReasons.coarseDate > 0) {
    breakdown.push(
      `时间轴细分：日历上不存在的日期 ${formatCount(result.excludedReasons.invalidDate)} 条、不是支持的日期写法 ${formatCount(
        result.excludedReasons.nonDateText,
      )} 条、只到年月、精度不足以定位具体日期 ${formatCount(result.excludedReasons.coarseDate)} 条。`,
    );
  }

  if (result.kind === 'bar') {
    if (!aggregated) {
      methodNotes.push(
        '逐条原始记录展示，未进行分组求和、平均或其他聚合；类别重复时以数据行号区分，多条记录不会被错误合并。',
      );
    } else {
      const isMean = result.aggregation === 'mean';
      methodNotes.push(
        '聚合口径：按 X 轴单元格原文分组（去掉首尾空白、区分大小写），一个类别一根柱子；不同写法不会被合并成同一类别，也不会跨类别合并。',
        isMean
          ? '平均值 = 组内数值累加 ÷ 组内有效样本数 n。0、负数与合法小数照常参与；缺失与无效记录既不进入分子也不进入分母；计算保留完整精度，小数位数只在展示文本上缩略。'
          : '合计 = 组内数值逐条累加。0、负数与合法小数照常参与；缺失与无效记录不进入求和；计算保留完整精度，小数位数只在展示文本上缩略。',
        '聚合只生成新的结果对象，不删除、不修改、不合并任何原始记录；不生成误差棒、标准差、显著性标记或任何未经计算的统计结论。',
      );
      if (!isMean) {
        methodNotes.push(
          '求和只对该列本身可加的指标（如计数、总量）才有意义；把高度、温度这类测量值相加不构成可解释的科研比较，本工具不会替你判断可加性。',
        );
      }
      if (isMean) {
        methodNotes.push('平均值会受组内记录数影响；这里只报告算术平均值本身，不推断两组之间是否有差异。');
      }
    }
  }

  if (result.kind === 'line') {
    methodNotes.push(
      '时间口径：日期一律按 UTC 解释，不使用 Date.parse、也不读浏览器时区；X 轴按真实时间等距并把刻度对齐到整天，tooltip 显示的是 CSV 里的原始日期文本。',
      '折线连接的是当前可用的观测点，两点之间没有实测数据；缺失的时间点不会被补齐，也不做插值、平滑、预测或趋势线。',
      '同一时间点（例如同一天）的多条记录按上传顺序全部保留、全部画出，不求平均、不求和、不去重。',
    );
    if (result.timeRange !== null) {
      methodNotes.push(
        `绘图时间范围（UTC）：${formatTimeTick(result.timeRange.min)} – ${formatTimeTick(result.timeRange.max)}。`,
      );
    }
  }

  if (result.displayedCount > 0) {
    methodNotes.push(`进入图表的 Y 数值范围：${rangeText(result.yRange)}。`);
  }

  let capNote: string | null = null;
  if (aggregated && result.hiddenCategoryCount > 0) {
    capNote =
      `类别组共 ${formatCount(result.categoryTotal ?? 0)} 组，本图仅展示前 ${formatCount(result.cap)} 组，` +
      `另有 ${formatCount(result.hiddenCategoryCount)} 组（包含 ${formatCount(result.capHidden)} 条有效记录）没有成柱。` +
      '这不是无效被排除，只是单图展示上限；未展示的组按整组跳过，不会被并进已显示的类别。';
  } else if (result.capHidden > 0) {
    capNote =
      `符合条件的记录共 ${formatCount(result.validCount)} 条，本图仅展示前 ${formatCount(result.cap)} 条，` +
      `另有 ${formatCount(result.capHidden)} 条有效记录未显示。这不是无效被排除，只是单图展示上限。`;
  }

  const description =
    `${kindLabel}，X 轴字段「${context.xLabel}」，Y 轴字段「${context.yLabel}」` +
    (aggregated ? `，聚合方式「${result.aggregation === 'mean' ? '按类别算术平均值' : '按类别求和'}」` : '') +
    `。图表标题「${context.title}」。原始记录 ${formatCount(result.rawTotal)} 条，` +
    `有效 ${formatCount(result.validCount)} 条，本图绘制 ${formatCount(result.displayedCount)} ${aggregated ? '根柱子' : '个点'}；` +
    `因缺失值排除 ${formatCount(result.missingExcluded)} 条，因类型不符或非有限数值排除 ${formatCount(
      result.invalidExcluded,
    )} 条` +
    `${result.capHidden > 0 ? `，另有 ${formatCount(result.capHidden)} 条有效记录因展示上限未显示` : ''}。`;

  return { headline, description, breakdown, methodNotes, capNote };
}

function pickDataIndex(params: unknown): number {
  if (typeof params === 'object' && params !== null && 'dataIndex' in params) {
    const value = (params as { dataIndex: unknown }).dataIndex;
    if (typeof value === 'number') return value;
  }
  return -1;
}

/** 尊重系统「减少动态效果」；无 matchMedia 环境（如 node 测试）默认不关闭动画。 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
