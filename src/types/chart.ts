/** Day 6 图表层的数据契约：图表类型、分类聚合口径与用户可编辑的图表配置。 */

/** 支持的图表类型：Day 5 柱状图 / 散点图，Day 6 新增折线图（时间序列）。 */
export type ChartKind = 'bar' | 'scatter' | 'line';

/**
 * 柱状图分类聚合口径。
 * - `raw`：每条有效记录一根柱子（Day 5 默认行为，不做任何合并）。
 * - `mean`：按 X 轴类别分组后对组内有效 Y 数值求算术平均值，一个类别一根柱子。
 * - `sum`：按类别求和，只适用于该列本身可加的指标；不适用于高度、温度等测量值。
 * 散点图与折线图没有类别轴，恒为 `raw`。
 */
export type CategoryAggregation = 'raw' | 'mean' | 'sum';

export interface ChartAxisConfig {
  /** 轴标题的用户输入原文；未编辑或全为空白时按字段名显示。 */
  title: string;
  /** 用户是否手动编辑过该轴标题；true 时更换字段不无提示覆盖。 */
  titleEdited: boolean;
  /** 单位标注原文，必须由用户填写；系统不臆测单位，也不做任何换算。 */
  unit: string;
}

/**
 * Y 轴起点配置（Day 7）。只影响柱状图的纵轴下界，不改动任何 CSV 数值或聚合结果。
 * - `auto`：不固定起点，由 ECharts 在 `scale:false` 下自动包含零基线（含负值与 0）。
 * - `manual`：用户输入的有限数值原文存于 `raw`；能否真正用于绘图、是否会裁剪数据，
 *   由 `resolveYAxisStart` 结合真实 Y 范围判定，不在这里下结论。
 */
export interface YAxisStartConfig {
  mode: 'auto' | 'manual';
  /** manual 模式下的输入原文（未做数值校验）；auto 模式忽略。 */
  raw: string;
}

export interface ChartConfig {
  /** 图表标题的用户输入原文。 */
  title: string;
  /** 用户是否手动编辑过图表标题；true 时切换类型或字段不无提示覆盖。 */
  titleEdited: boolean;
  xAxis: ChartAxisConfig;
  yAxis: ChartAxisConfig;
  /** Y 轴起点（柱状图纵轴下界）配置；默认自动，含零基线。 */
  yAxisStart: YAxisStartConfig;
}
