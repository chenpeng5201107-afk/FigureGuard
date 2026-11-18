import type { CategoryAggregation, ChartAxisConfig, ChartConfig, ChartKind } from '../types/chart';

/**
 * 图表配置纯函数层：标题 / 坐标轴标题 / 单位的默认生成、用户编辑协调、输入校验与「修改前后对比快照」。
 * 不依赖 React 与 ECharts，也不读任何 CSV 单元格：配置只影响图表表达，不参与数值计算。
 */

/** 图表标题最大字符数，超出只缩略显示文本。 */
export const MAX_TITLE_LENGTH = 120;
/** 坐标轴标题最大字符数。 */
export const MAX_AXIS_TITLE_LENGTH = 60;
/** 单位标注最大字符数。 */
export const MAX_UNIT_LENGTH = 24;

export const CHART_KIND_LABELS: Record<ChartKind, string> = {
  bar: '柱状图',
  scatter: '散点图',
  line: '折线图',
};

export const AGGREGATION_LABELS: Record<CategoryAggregation, string> = {
  raw: '原始记录',
  mean: '按类别平均值',
  sum: '按类别求和',
};

const UNSELECTED_FIELD = '（未选择字段）';

/** C0 / C1 控制字符：进入画布文本前换成空格，避免不可见字符把标题截断成看不出问题的形态。 */
function isControlChar(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function replaceControlChars(text: string, replacement: string): string {
  let result = '';
  for (const char of text) {
    result += isControlChar(char.codePointAt(0) ?? 0) ? replacement : char;
  }
  return result;
}

/** 去掉控制字符并按上限缩略：只处理显示文本，不触碰任何 CSV 单元格。 */
export function sanitizeChartText(text: string, maxLength: number): string {
  const clean = replaceControlChars(text, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

function countControlChars(text: string): number {
  let count = 0;
  for (const char of text) {
    if (isControlChar(char.codePointAt(0) ?? 0)) count += 1;
  }
  return count;
}

export function emptyAxisConfig(): ChartAxisConfig {
  return { title: '', titleEdited: false, unit: '' };
}

export function defaultChartConfig(): ChartConfig {
  return { title: '', titleEdited: false, xAxis: emptyAxisConfig(), yAxis: emptyAxisConfig() };
}

export interface ChartFieldLabels {
  /** X 轴字段显示名。 */
  x: string;
  /** Y 轴字段显示名。 */
  y: string;
}

export interface ChartTitleDefaults {
  title: string;
  xTitle: string;
  yTitle: string;
}

/**
 * 默认标题全部由「图表类型 + 字段名 + 聚合口径」拼出，不含任何对数据内容的判断：
 * 字段没选时明确写「（未选择字段）」而不是编一个好看的标题。
 */
export function computeTitleDefaults(
  kind: ChartKind,
  fields: ChartFieldLabels,
  aggregation: CategoryAggregation,
): ChartTitleDefaults {
  const x = sanitizeChartText(fields.x, MAX_AXIS_TITLE_LENGTH) || UNSELECTED_FIELD;
  const y = sanitizeChartText(fields.y, MAX_AXIS_TITLE_LENGTH) || UNSELECTED_FIELD;
  const kindLabel = CHART_KIND_LABELS[kind];

  let title: string;
  if (kind === 'scatter') title = `${kindLabel}：${x} 与 ${y} 的关系`;
  else if (kind === 'line') title = `${kindLabel}：${y} 随 ${x} 的变化`;
  else if (aggregation === 'raw') title = `${kindLabel}：按 ${x} 逐条展示 ${y}`;
  else title = `${kindLabel}：按 ${x} 计算 ${y} ${AGGREGATION_LABELS[aggregation].replace('按类别', '')}`;

  return { title, xTitle: x, yTitle: y };
}

/** 用户编辑过且缩略后非空才用用户文本，否则跟随默认（字段名 / 自动标题）。 */
function pickEditedOrFallback(userText: string, edited: boolean, fallback: string, maxLength: number): string {
  if (!edited) return fallback;
  const clean = sanitizeChartText(userText, maxLength);
  return clean === '' ? fallback : clean;
}

/** 标题与单位合成坐标轴标注；单位为空时只显示标题，标题为空时只显示单位。 */
export function composeAxisLabel(title: string, unit: string): string {
  if (title === '') return unit;
  if (unit === '') return title;
  return `${title}（${unit}）`;
}

export interface ChartConfigSnapshot {
  /** 生效的图表标题。 */
  title: string;
  xTitle: string;
  xUnit: string;
  /** X 轴标注 = 标题 + 单位。 */
  xAxisLabel: string;
  yTitle: string;
  yUnit: string;
  yAxisLabel: string;
}

/**
 * 把「用户输入 + 当前字段 / 类型 / 聚合」解析成一份完整生效配置。
 * Day 7 的风险诊断与修复对比可以直接对两份快照做 diff，不需要再关心编辑状态。
 */
export function resolveChartTitles(config: ChartConfig, defaults: ChartTitleDefaults): ChartConfigSnapshot {
  const xTitle = pickEditedOrFallback(config.xAxis.title, config.xAxis.titleEdited, defaults.xTitle, MAX_AXIS_TITLE_LENGTH);
  const yTitle = pickEditedOrFallback(config.yAxis.title, config.yAxis.titleEdited, defaults.yTitle, MAX_AXIS_TITLE_LENGTH);
  const xUnit = sanitizeChartText(config.xAxis.unit, MAX_UNIT_LENGTH);
  const yUnit = sanitizeChartText(config.yAxis.unit, MAX_UNIT_LENGTH);
  return {
    title: pickEditedOrFallback(config.title, config.titleEdited, defaults.title, MAX_TITLE_LENGTH),
    xTitle,
    xUnit,
    xAxisLabel: composeAxisLabel(xTitle, xUnit),
    yTitle,
    yUnit,
    yAxisLabel: composeAxisLabel(yTitle, yUnit),
  };
}

export interface ChartConfigNotice {
  /** 稳定标识，同一类提示只保留一条。 */
  key: string;
  message: string;
}

/**
 * 输入校验：说明「哪段文本被忽略 / 缩略、当前实际显示的是什么」，不阻断渲染，也不改动数据。
 */
export function validateChartConfig(config: ChartConfig, snapshot: ChartConfigSnapshot): ChartConfigNotice[] {
  const notices: ChartConfigNotice[] = [];
  const checks: Array<{ key: string; label: string; raw: string; max: number; effective: string }> = [
    { key: 'title', label: '图表标题', raw: config.title, max: MAX_TITLE_LENGTH, effective: snapshot.title },
    { key: 'xTitle', label: 'X 轴标题', raw: config.xAxis.title, max: MAX_AXIS_TITLE_LENGTH, effective: snapshot.xTitle },
    { key: 'yTitle', label: 'Y 轴标题', raw: config.yAxis.title, max: MAX_AXIS_TITLE_LENGTH, effective: snapshot.yTitle },
    { key: 'xUnit', label: 'X 轴单位', raw: config.xAxis.unit, max: MAX_UNIT_LENGTH, effective: snapshot.xUnit },
    { key: 'yUnit', label: 'Y 轴单位', raw: config.yAxis.unit, max: MAX_UNIT_LENGTH, effective: snapshot.yUnit },
  ];

  for (const check of checks) {
    const controlChars = countControlChars(check.raw);
    if (controlChars > 0) {
      notices.push({
        key: `${check.key}-control`,
        message: `${check.label}里有 ${controlChars} 个不可见控制字符，显示时已忽略（只影响标题，不改动数据）。`,
      });
    }
    const visible = replaceControlChars(check.raw, ' ').trim();
    if (visible.length > check.max) {
      notices.push({
        key: `${check.key}-long`,
        message: `${check.label}超过 ${check.max} 字，图表上只显示前 ${check.max} 字。`,
      });
    }
    if (check.raw !== '' && check.raw.trim() === '') {
      notices.push({ key: `${check.key}-space`, message: `${check.label}只输入了空格，按未填写处理。` });
    }
    if (check.raw.trim() !== '' && visible === '') {
      notices.push({ key: `${check.key}-blank`, message: `${check.label}只包含不可见字符，按未填写处理。` });
    }
    if (check.key === 'title' && config.titleEdited && check.raw.trim() === '') {
      notices.push({ key: 'title-fallback', message: '图表标题留空时按图表类型与字段自动生成。' });
    }
  }
  return notices;
}

export interface ChartAxisReset {
  axis: ChartAxisConfig;
  notices: ChartConfigNotice[];
}

/**
 * 更换某个轴的字段后重置该轴的手写标题与单位：
 * 旧字段的标注套到新字段上会误导读者，因此不保留，但必须说明为什么清空。
 */
export function resetAxisAfterFieldChange(axis: ChartAxisConfig, axisKey: 'x' | 'y'): ChartAxisReset {
  const label = axisKey === 'x' ? 'X 轴' : 'Y 轴';
  const hadTitle = axis.titleEdited && sanitizeChartText(axis.title, MAX_AXIS_TITLE_LENGTH) !== '';
  const hadUnit = sanitizeChartText(axis.unit, MAX_UNIT_LENGTH) !== '';
  if (!hadTitle && !hadUnit) return { axis, notices: [] };

  const parts: string[] = [];
  if (hadTitle) parts.push(`标题「${sanitizeChartText(axis.title, MAX_AXIS_TITLE_LENGTH)}」`);
  if (hadUnit) parts.push(`单位「${sanitizeChartText(axis.unit, MAX_UNIT_LENGTH)}」`);
  return {
    axis: emptyAxisConfig(),
    notices: [
      {
        key: `${axisKey}-axis-field-changed`,
        message: `${label}字段已更换，原先填写${parts.join('与')}已清空，避免把旧字段的标注套到新字段上。`,
      },
    ],
  };
}

/**
 * 切换图表类型 / 聚合时，手动填写的图表标题保持不变（不无提示覆盖），
 * 但要告诉用户它没有跟随新字段，并给出手动恢复自动标题的入口。
 */
export function chartTitleCarryOverNotice(config: ChartConfig, snapshot: ChartConfigSnapshot): ChartConfigNotice | null {
  if (!config.titleEdited || sanitizeChartText(config.title, MAX_TITLE_LENGTH) === '') return null;
  return {
    key: 'title-manual',
    message: `图表标题仍是你手动填写的「${snapshot.title}」，不随字段自动更新；点「恢复自动标题」可跟随当前图表类型与字段。`,
  };
}

export interface ContextChangeFlags {
  /** X 轴字段是否换成了别的列。 */
  xAxisFieldChanged: boolean;
  /** Y 轴字段是否换成了别的列。 */
  yAxisFieldChanged: boolean;
  /** 自动生成的图表标题是否会因为类型 / 字段 / 聚合而变化。 */
  defaultTitleChanged: boolean;
  /** 聚合口径是否被重置（只有柱状图有类别轴）。 */
  aggregationDropped: boolean;
}

export interface ReconciledConfig {
  config: ChartConfig;
  notices: ChartConfigNotice[];
}

/**
 * 上下文变化后的配置协调：通用设置（手动图表标题）保留，不适用的设置（换掉字段那根轴的标注、
 * 非柱状图的聚合口径）重置，并且每一条重置都要留下可读的说明，不静默覆盖用户输入。
 */
export function reconcileConfigForContext(config: ChartConfig, snapshot: ChartConfigSnapshot, change: ContextChangeFlags): ReconciledConfig {
  let next = config;
  const notices: ChartConfigNotice[] = [];

  if (change.xAxisFieldChanged) {
    const reset = resetAxisAfterFieldChange(next.xAxis, 'x');
    next = { ...next, xAxis: reset.axis };
    notices.push(...reset.notices);
  }
  if (change.yAxisFieldChanged) {
    const reset = resetAxisAfterFieldChange(next.yAxis, 'y');
    next = { ...next, yAxis: reset.axis };
    notices.push(...reset.notices);
  }
  if (change.aggregationDropped) {
    notices.push({
      key: 'aggregation-dropped',
      message: '聚合方式只适用于柱状图的类别轴，切换到当前图表类型后已回到逐条原始记录。',
    });
  }
  if (change.defaultTitleChanged) {
    const carry = chartTitleCarryOverNotice(next, snapshot);
    if (carry) notices.push(carry);
  }
  return { config: next, notices };
}

export interface ChartConfigChange {
  key: keyof ChartConfigSnapshot;
  label: string;
  before: string;
  after: string;
}

const SNAPSHOT_LABELS: Record<keyof ChartConfigSnapshot, string> = {
  title: '图表标题',
  xTitle: 'X 轴标题',
  xUnit: 'X 轴单位',
  xAxisLabel: 'X 轴标注',
  yTitle: 'Y 轴标题',
  yUnit: 'Y 轴单位',
  yAxisLabel: 'Y 轴标注',
};

/** 只列出真实不同的字段，供 Day 7 做「修改前 / 修改后」对比；本轮不做任何风险判定。 */
export function diffChartConfig(before: ChartConfigSnapshot, after: ChartConfigSnapshot): ChartConfigChange[] {
  const keys: Array<keyof ChartConfigSnapshot> = ['title', 'xTitle', 'xUnit', 'yTitle', 'yUnit'];
  const changes: ChartConfigChange[] = [];
  for (const key of keys) {
    if (before[key] !== after[key]) {
      changes.push({ key, label: SNAPSHOT_LABELS[key], before: before[key], after: after[key] });
    }
  }
  return changes;
}
