import {
  AGGREGATION_LABELS,
  CHART_KIND_LABELS,
  resolveChartTitles,
  resolveYAxisStart,
} from './chartConfig';
import type { ChartConfigSnapshot, ChartTitleDefaults } from './chartConfig';
import { toEChartsOption } from './chartData';
import type { ChartDataResult } from './chartData';
import { BASELINE_CONFIG_SOURCE, BASELINE_RULE_ID } from './chartDiagnostics';
import type { AxisStartEvidence, BaselineDiagnostic, BaselineDiagnosticStatus } from './chartDiagnostics';
import { formatComputedValue, formatCount } from './format';
import type { CategoryAggregation, ChartConfig, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';

/**
 * Day 8「一键修复 → 前后对比 → 撤销」的纯函数层。
 *
 * 修复只做一件事：把柱状图的 Y 轴起点配置从「手动、且真正排除了 0」恢复成自动范围。
 * 原始 CSV、字段选择、聚合口径与记录计数都不参与改写，两张对比图共用同一份 ChartDataResult。
 * 本模块不依赖 React 与 ECharts 实例：只按 `diagnoseBaseline()` 的真实结论决定能不能修、修完留下什么证据。
 */

/** 本轮唯一的修复操作类型。 */
export const REPAIR_ACTION = 'restore-auto-zero-baseline';

/** 修复按钮文案。 */
export const REPAIR_ACTION_LABEL = '一键恢复零基线';

/** 修复操作的数据上下文标识。 */
export interface ChartRepairContext {
  /** 每次解析都产出新的 CsvTable 对象：重新加载同名 CSV 也是新引用，旧修复不会串联到新数据上。 */
  table: CsvTable;
  /** 仅作参考信息，失效判断一律以 `table` 引用为准，不拿文件名当真值。 */
  fileName: string;
  recordCount: number;
  columnCount: number;
}

export interface ChartRepairRecord {
  ruleId: typeof BASELINE_RULE_ID;
  action: typeof REPAIR_ACTION;
  /** 修复发生时的图表类型与字段 / 聚合口径：对比两侧与失效判断都以它们为准。 */
  kind: ChartKind;
  xIndex: number;
  yIndex: number;
  aggregation: CategoryAggregation;
  xFieldLabel: string;
  yFieldLabel: string;
  /** 修复前后的完整配置快照（配置对象只由不可变更新产生，不会被后续编辑原地改写）。 */
  beforeConfig: ChartConfig;
  afterConfig: ChartConfig;
  /** 修复前**真正写进 ECharts `yAxis.min`** 的下界，取自诊断证据，不是输入框里的字符串。 */
  beforeAppliedMin: number;
  beforeAxisStart: AxisStartEvidence;
  /** 修复后生效的轴模式：自动范围，由 scale:false 一并容纳负值与 0。 */
  afterAxisStart: AxisStartEvidence;
  /** 触发修复的原诊断证据，状态按当时的真实计算结果保留。 */
  evidence: BaselineDiagnostic;
  context: ChartRepairContext;
  /** 修复时的绘图结果：前后两张图共用它，数值 / 类别顺序 / 聚合口径必然一致。 */
  result: ChartDataResult;
  beforeSnapshot: ChartConfigSnapshot;
  afterSnapshot: ChartConfigSnapshot;
  /** 修复前 / 后各自完整生成一次的真实 option，不随后续配置编辑重新计算。 */
  beforeOption: Record<string, unknown>;
  afterOption: Record<string, unknown>;
}

/** 生成修复记录所需的全部输入，均来自 ChartLab 当次渲染的真实计算结果。 */
export interface ChartRepairSource {
  table: CsvTable;
  /** 数据质量准入是否通过：被阻止时不进入修复流程，也不给修复入口。 */
  admissionAllowed: boolean;
  kind: ChartKind;
  xIndex: number;
  yIndex: number;
  aggregation: CategoryAggregation;
  config: ChartConfig;
  result: ChartDataResult | null;
  diagnostic: BaselineDiagnostic | null;
  xFieldLabel: string;
  yFieldLabel: string;
  titleDefaults: ChartTitleDefaults;
}

export interface RepairEligibility {
  eligible: boolean;
  /** 不满足时说明为什么不提供修复入口；满足时说明修复依据。 */
  reason: string;
}

/** 非 risk 状态下的「为什么不能修」，逐态说明，不给无效配置伪造成功。 */
const BLOCKED_BY_STATUS: Record<Exclude<BaselineDiagnosticStatus, 'risk'>, string> = {
  clear: '当前生效的纵轴范围已经包含零基线，本条规则没有风险可修复。',
  'not-applicable': '本条规则只检查普通柱状图，当前图表类型没有可修复项。',
  'invalid-config': 'Y 轴起点配置无效、并没有被应用到坐标轴，请先修正配置；本工具不会为没有生效的配置伪造修复结果。',
  'no-data': '当前没有可绘制的有限数值，不存在可修复的纵轴起点。',
};

/**
 * 判定「当前状态能否一键修复」，六个条件缺一不可：
 * 准入通过、柱状图、有实际绘制的有限数值、诊断为 risk、规则是 bar-zero-baseline、生效下界确实排除了 0。
 * 最后一条取诊断证据里的 `appliedMin`（真正写进坐标轴的值），不看输入框里的文本。
 */
export function evaluateRepairEligibility(source: ChartRepairSource): RepairEligibility {
  if (!source.admissionAllowed) {
    return { eligible: false, reason: '数据质量准入未通过（结构降级或存在会读错数据的解析错误），此时不修改任何图表配置。' };
  }
  if (source.result === null || source.diagnostic === null) {
    return { eligible: false, reason: '还没有生成可检查的图表，请先选择用于绘图的 X 轴与 Y 轴字段。' };
  }
  if (source.kind !== 'bar') {
    return { eligible: false, reason: BLOCKED_BY_STATUS['not-applicable'] };
  }
  if (source.result.yRange === null || source.result.validCount === 0) {
    return { eligible: false, reason: BLOCKED_BY_STATUS['no-data'] };
  }
  const { diagnostic } = source;
  if (diagnostic.ruleId !== BASELINE_RULE_ID) {
    return { eligible: false, reason: '当前诊断规则不支持一键修复。' };
  }
  if (diagnostic.status !== 'risk') {
    return { eligible: false, reason: BLOCKED_BY_STATUS[diagnostic.status] };
  }
  const floor = diagnostic.axisStart.appliedMin;
  if (diagnostic.axisStart.mode !== 'manual' || floor === null || floor <= 0) {
    return { eligible: false, reason: '当前生效的纵轴下界并没有排除零基线，无需修复。' };
  }
  return {
    eligible: true,
    reason: `纵轴实际以 ${formatComputedValue(floor)} 为下界、可见范围不含 0，可把起点恢复为自动范围。`,
  };
}

/** 修复后的配置：只改 `yAxisStart`，其余字段逐字保留。 */
export function applyAutoBaselineConfig(config: ChartConfig): ChartConfig {
  return { ...config, yAxisStart: { mode: 'auto', raw: '' } };
}

/**
 * 生成一份修复记录；状态不满足修复条件时返回 null（重复点击、配置已变化都不会追加记录）。
 * 前后两张图的 option 在这里各生成一次并钉存，之后不再引用可能被编辑的实时配置。
 */
export function createRepairRecord(source: ChartRepairSource): ChartRepairRecord | null {
  const eligibility = evaluateRepairEligibility(source);
  if (!eligibility.eligible || source.diagnostic === null || source.result === null) return null;

  const { diagnostic, result, config, xFieldLabel, yFieldLabel, titleDefaults } = source;
  const floor = diagnostic.axisStart.appliedMin;
  if (floor === null || diagnostic.axisStart.mode !== 'manual' || floor <= 0) return null;

  const beforeConfig = config;
  const afterConfig = applyAutoBaselineConfig(config);
  const beforeSnapshot = resolveChartTitles(beforeConfig, titleDefaults);
  const afterSnapshot = resolveChartTitles(afterConfig, titleDefaults);
  const meta = {
    xLabel: xFieldLabel,
    yLabel: yFieldLabel,
    xName: beforeSnapshot.xAxisLabel,
    yName: beforeSnapshot.yAxisLabel,
  };

  return {
    ruleId: BASELINE_RULE_ID,
    action: REPAIR_ACTION,
    kind: source.kind,
    xIndex: source.xIndex,
    yIndex: source.yIndex,
    aggregation: source.aggregation,
    xFieldLabel,
    yFieldLabel,
    beforeConfig,
    afterConfig,
    beforeAppliedMin: floor,
    beforeAxisStart: { mode: 'manual', appliedMin: floor },
    afterAxisStart: { mode: 'auto', appliedMin: null },
    evidence: diagnostic,
    context: {
      table: source.table,
      fileName: source.table.fileName,
      recordCount: source.table.recordCount,
      columnCount: source.table.columnCount,
    },
    result,
    beforeSnapshot,
    afterSnapshot,
    beforeOption: toEChartsOption(result, { ...meta, yMin: floor }),
    afterOption: toEChartsOption(result, { ...meta, yMin: undefined }),
  };
}

/** 当前工作台状态：与修复记录逐项比较，判断这份记录还适不适用于画面。 */
export interface ChartWorkbenchState {
  table: CsvTable;
  kind: ChartKind;
  xIndex: number | null;
  yIndex: number | null;
  aggregation: CategoryAggregation;
}

/** 逐字段比较配置：图表配置全部由不可变更新产生，这里只做等值判断，不写回任何默认值。 */
export function sameChartConfig(a: ChartConfig, b: ChartConfig): boolean {
  return (
    a.title === b.title &&
    a.titleEdited === b.titleEdited &&
    a.xAxis.title === b.xAxis.title &&
    a.xAxis.titleEdited === b.xAxis.titleEdited &&
    a.xAxis.unit === b.xAxis.unit &&
    a.yAxis.title === b.yAxis.title &&
    a.yAxis.titleEdited === b.yAxis.titleEdited &&
    a.yAxis.unit === b.yAxis.unit &&
    a.yAxisStart.mode === b.yAxisStart.mode &&
    a.yAxisStart.raw === b.yAxisStart.raw
  );
}

/**
 * 修复记录相对当前画面是否已经过期；过期时给出可直接展示的原因，未过期返回 null。
 * 换数据、换图表类型、换字段、换聚合、以及修复后再改任何配置（含 Y 轴起点、标题、单位）都会失效，
 * 采取「标记过期并清除」这一条一致策略，不让用户看到与当前画面不符的旧快照。
 */
export function describeRepairStaleness(record: ChartRepairRecord, state: ChartWorkbenchState, config: ChartConfig): string | null {
  if (state.table !== record.context.table) {
    return '已更换或重新加载数据文件，之前的修复对比与撤销属于另一份数据，已清除。';
  }
  if (state.kind !== record.kind) {
    return '已切换图表类型，柱状图零基线的修复对比不再适用于当前图表，已清除。';
  }
  if (state.xIndex !== record.xIndex || state.yIndex !== record.yIndex) {
    return '已更换 X / Y 轴字段，绘图数值随之改变，之前的修复对比与撤销已清除。';
  }
  if (state.aggregation !== record.aggregation) {
    return '已修改分类聚合方式，柱子代表的不再是同一组数值，之前的修复对比与撤销已清除。';
  }
  if (!sameChartConfig(config, record.afterConfig)) {
    if (config.yAxisStart.mode !== record.afterConfig.yAxisStart.mode || config.yAxisStart.raw !== record.afterConfig.yAxisStart.raw) {
      return '你在修复后又手动修改了 Y 轴起点，当前纵轴已与记录里的「修复后」不一致，前后对比与撤销已清除。';
    }
    return '你在修复后又修改了标题或单位等图表配置，为避免展示与当前画面不符的旧快照，本次前后对比与撤销已清除。';
  }
  return null;
}

/** 撤销前的安全评估：配置能否原样恢复到当前数据上。 */
export interface RepairUndoEvaluation {
  ok: boolean;
  /** 无论成败都给出对用户可读的说明。 */
  message: string;
}

/**
 * 撤销要求修复前的起点在当前数据下仍然安全可应用：配置层不报裁剪错误，且解析出的下界与记录一致。
 * 不满足就拒绝撤销，绝不把过期配置强行写回坐标轴。
 */
export function evaluateRepairUndo(
  record: ChartRepairRecord,
  state: ChartWorkbenchState,
  config: ChartConfig,
  yRange: { min: number; max: number } | null,
): RepairUndoEvaluation {
  const stale = describeRepairStaleness(record, state, config);
  if (stale !== null) {
    return { ok: false, message: `本次修复已过期，无法撤销：${stale}` };
  }
  const restored = resolveYAxisStart(record.beforeConfig.yAxisStart, yRange);
  if (restored.error !== null) {
    return {
      ok: false,
      message: `修复前的起点在当前数据下已不能安全应用，因此没有撤销：${restored.error}`,
    };
  }
  return {
    ok: true,
    message:
      `已撤销本次修复：Y 轴起点恢复为手动 ${formatComputedValue(record.beforeAppliedMin)}，` +
      '图表与诊断都按恢复后的配置重新计算，原始数据没有被改动。',
  };
}

/** 针对 `yAxisStart` 的配置差异：既有 `diffChartConfig()` 只管标题与单位，轴起点单独在此比较。 */
export interface YAxisStartDiff {
  key: 'yAxisStart';
  label: string;
  before: string;
  after: string;
}

function axisStartText(start: AxisStartEvidence): string {
  if (start.mode === 'auto') return '自动范围（由坐标轴自动包含 0）';
  return start.appliedMin === null ? '手动配置未生效' : `手动 ${formatComputedValue(start.appliedMin)}`;
}

/** 两份轴起点证据完全一致时返回 null，不产出「改了但没改」的差异行。 */
export function diffYAxisStart(before: AxisStartEvidence, after: AxisStartEvidence): YAxisStartDiff | null {
  const beforeText = axisStartText(before);
  const afterText = axisStartText(after);
  if (beforeText === afterText) return null;
  return { key: 'yAxisStart', label: 'Y 轴起点', before: beforeText, after: afterText };
}

/** 「本次修复修改了什么？」的一行说明。 */
export interface RepairChangeItem {
  label: string;
  value: string;
}

/**
 * 全部文字都由记录里的真实配置、诊断证据与绘图统计拼出：
 * 只说「调整了图表配置」，不说「科研错误已修复」；自动范围只承诺包含 0，不宣称下界恰好是 0。
 */
export function describeRepairChanges(record: ChartRepairRecord): RepairChangeItem[] {
  const { result } = record;
  const diff = diffYAxisStart(record.beforeAxisStart, record.afterAxisStart);
  const items: RepairChangeItem[] = [
    { label: '检测规则', value: `${record.evidence.title}（规则 ID：${record.ruleId}）` },
  ];
  if (diff !== null) items.push({ label: diff.label, value: `${diff.before} → ${diff.after}` });
  items.push(
    { label: '更改类型', value: `图表配置（${BASELINE_CONFIG_SOURCE}）` },
    {
      label: '原始数据',
      value: '未修改：CSV 单元格内容、数据行号与分组方式全部保持原样。',
    },
    {
      label: '数据记录数',
      value:
        `未修改：原始记录 ${formatCount(result.rawTotal)} 条、有效记录 ${formatCount(result.validCount)} 条` +
        `（本图实际绘制 ${formatCount(result.displayedCount)} 个展示单元），修复前后同一份数据。`,
    },
    {
      label: '绘图方法',
      value: `未修改：${CHART_KIND_LABELS[record.kind]} · ${AGGREGATION_LABELS[record.aggregation]}。`,
    },
  );
  return items;
}

/** 对比区下方的一句话说明，数字取自修复记录而非写死。 */
export function describeRepairComparison(record: ChartRepairRecord): string {
  return (
    '两张图使用完全相同的实验数据，仅改变纵轴显示范围。' +
    `修复前的纵轴下界为 ${formatComputedValue(record.beforeAppliedMin)}，修复后恢复自动范围、纵轴包含 0；` +
    '两张图的数值、类别顺序与聚合口径逐条一致。'
  );
}
