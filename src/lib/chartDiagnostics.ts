import type { ResolvedYAxisStart } from './chartConfig';
import type { ChartKind } from '../types/chart';

/**
 * 图表表达风险诊断（Day 7 首条规则）：柱状图非零基线。
 *
 * 纯函数模块，不依赖 React / ECharts，也不读任何 CSV 单元格：
 * 只根据「当前真实用于绘图的纵轴起点」与「进入图表的 Y 数值范围」判断，
 * 二者与 ECharts option 共用同一个 `resolveYAxisStart().appliedMin`，保证「输入 = 绘图 = 诊断」一致。
 *
 * 本模块只做检测、证据、解释与建议；修复动作、前后对比、撤销属于 Day 8。
 */

/** 诊断结论状态：区分「有风险 / 已含零基线 / 类型不适用 / 配置无效 / 无数据」，不把不适用谎报成通过。 */
export type BaselineDiagnosticStatus = 'risk' | 'clear' | 'not-applicable' | 'invalid-config' | 'no-data';

/** 风险级别。本轮只有一档「建议改进」，不做评分，也不给绝对对错。 */
export type RiskLevel = 'advisory' | 'none';

/** 唯一规则 ID：Day 8 的修复操作按此 ID 定位到需要改动的配置项。 */
export const BASELINE_RULE_ID = 'bar-zero-baseline';

/** 相关配置来源的稳定标识，供修复与追溯使用。 */
export const BASELINE_CONFIG_SOURCE = 'chartConfig.yAxisStart';

/** 当前实际纵轴起点配置的证据快照（与真正用于绘图的配置一致，非用户输入框的原始文本）。 */
export interface AxisStartEvidence {
  mode: 'auto' | 'manual';
  /** 真正写进 ECharts `yAxis.min` 的下界；自动或配置无效退回自动时为 null。 */
  appliedMin: number | null;
}

export interface BaselineDiagnostic {
  ruleId: typeof BASELINE_RULE_ID;
  /** 本规则当前适用的图表类型，恒为柱状图；非柱状图时状态为 not-applicable。 */
  appliesTo: 'bar';
  chartKind: ChartKind;
  status: BaselineDiagnosticStatus;
  level: RiskLevel;
  /** 简短问题标题。 */
  title: string;
  /** 一句话结论：说明看到了什么、为什么这样判断。 */
  summary: string;
  /** 当前实际坐标轴配置证据。 */
  axisStart: AxisStartEvidence;
  /** 进入图表的真实 Y 数值范围；无数据时为 null。 */
  dataRange: { min: number; max: number } | null;
  /** 可能产生的视觉影响；无风险 / 不适用时为空串。 */
  impact: string;
  /** 建议的改进方式。 */
  recommendation: string;
  /** 相关字段或配置来源，供 Day 8 修复定位。 */
  configSource: string;
  /** 参与判断的 Y 轴字段显示名。 */
  yFieldLabel: string;
}

export interface BaselineDiagnosticInput {
  kind: ChartKind;
  /** 来自 computeChartData 的真实 Y 范围；没有绘制点时为 null。 */
  yRange: { min: number; max: number } | null;
  /** 来自 resolveYAxisStart 的实际生效起点，是唯一判断依据。 */
  axisStart: ResolvedYAxisStart;
  yFieldLabel: string;
}

function base(kind: ChartKind, axisStart: ResolvedYAxisStart, yRange: { min: number; max: number } | null, yFieldLabel: string) {
  return {
    ruleId: BASELINE_RULE_ID as typeof BASELINE_RULE_ID,
    appliesTo: 'bar' as const,
    chartKind: kind,
    axisStart: { mode: axisStart.mode, appliedMin: axisStart.appliedMin },
    dataRange: yRange,
    configSource: BASELINE_CONFIG_SOURCE,
    yFieldLabel,
  };
}

/**
 * 判断普通数值柱状图的纵轴可见范围是否明确不含 0。
 *
 * 只在我们能确定「0 被排除在可见范围之下」时才报风险：手动起点 appliedMin 是有限正数，
 * 此时可见上界至少到数据最大值（必然大于该正起点），0 一定落在坐标轴下界之外。
 * 自动模式（scale:false）与起点 ≤ 0 都包含 0，判为无风险；无法确认的场景一律不臆测。
 *
 * 起点是否把有效数值裁到轴外不由本规则重复判定：`resolveYAxisStart()` 已在配置层拦下
 * 「起点高于数据最小值」的裁剪配置并退回自动范围，本模块通过 `status: 'invalid-config'` 如实转述，
 * 绝不用「未发现风险」掩盖裁剪问题，也不另立一套裁剪规则。
 */
export function diagnoseBaseline(input: BaselineDiagnosticInput): BaselineDiagnostic {
  const { kind, yRange, axisStart, yFieldLabel } = input;

  // 1. 图表类型边界：非柱状图不套用本规则，明确说明不适用，而不是「全部检查通过」。
  if (kind !== 'bar') {
    return {
      ...base(kind, axisStart, yRange, yFieldLabel),
      status: 'not-applicable',
      level: 'none',
      title: '当前图表类型不适用柱状图零基线检查',
      summary: '本轮规则只针对以柱子长度表示数值的普通柱状图；散点图、折线图不以长度编码大小，不作非零基线判断。',
      impact: '',
      recommendation: '如需检查柱状图零基线，请切换到柱状图；散点图与折线图的坐标轴起点设置不在本轮诊断范围内。',
    };
  }

  // 2. 配置无效：先报告坐标轴配置问题，不能凭一个没被应用的数字声称图表有风险。
  if (axisStart.error !== null) {
    return {
      ...base(kind, axisStart, yRange, yFieldLabel),
      status: 'invalid-config',
      level: 'none',
      title: 'Y 轴起点配置无效',
      summary: axisStart.error,
      impact: '',
      recommendation: '请先修正 Y 轴起点：手动设置请输入有限的合法数值，或改回自动；配置有效后才会进行零基线检查。',
    };
  }

  // 3. 没有可绘制的有限数值：没有可见范围，不产出虚假诊断。
  if (yRange === null) {
    return {
      ...base(kind, axisStart, yRange, yFieldLabel),
      status: 'no-data',
      level: 'none',
      title: '没有可检查的数值',
      summary: '当前选择下没有任何进入图表的有限数值，无法确定纵轴可见范围，因此不进行零基线判断。',
      impact: '',
      recommendation: '请确认 Y 轴字段与数据；有可绘制的数值后再查看检查结果。',
    };
  }

  // 4. 正常数值柱状图：根据真正用于绘图的起点判断 0 是否在可见范围内。
  const floor = axisStart.appliedMin;
  const excludesZero = floor !== null && floor > 0;
  if (excludesZero) {
    return {
      ...base(kind, axisStart, yRange, yFieldLabel),
      status: 'risk',
      level: 'advisory',
      title: '柱状图非零基线',
      summary: `纵轴实际从 ${floor} 起，可见范围不包含 0，可能夸大不同数值之间的相对差异。`,
      impact: '以柱子长度表示数值时，去掉零基线会放大相邻数值之间的视觉差距，让差别看起来比实际更悬殊。',
      recommendation:
        '对于以长度表示数值的柱状图，通常建议包含零基线。可把 Y 轴起点切回自动或设为 0，并与当前效果对比；' +
        '是否保留取决于图表类型与表达意图，本工具不据此判断数据对错，也不认定科研造假。',
    };
  }

  return {
    ...base(kind, axisStart, yRange, yFieldLabel),
    status: 'clear',
    level: 'none',
    title: '纵轴包含零基线',
    summary:
      floor === null
        ? '纵轴按自动范围绘制并包含 0，本次未发现非零基线表达风险。'
        : `纵轴起点为 ${floor}，可见范围包含 0，本次未发现非零基线表达风险。`,
    impact: '',
    recommendation: '保持包含 0 的纵轴即可；如后续手动改高起点，本检查会实时更新。',
  };
}

/** 状态的可读中文名，供面板徽标使用。 */
export const BASELINE_STATUS_LABELS: Record<BaselineDiagnosticStatus, string> = {
  risk: '建议核查',
  clear: '未发现风险',
  'not-applicable': '不适用',
  'invalid-config': '配置无效',
  'no-data': '无数据',
};
