import { buildExportFileName, saveFile } from './fileDownload';
import { exportChartPng } from './chartPngExport';
import { buildMarkdownReport, buildReportFileName } from './reportExport';
import { formatCount } from './format';
import type { SaveFileOutcome } from './fileDownload';
import type { PngExportRequest } from './chartPngExport';
import type { ReportChartContext, ReportInput } from './reportExport';
import type { ChartConfigSnapshot, ResolvedYAxisStart } from './chartConfig';
import type { ChartDataResult, ChartScopeSummary } from './chartData';
import type { BaselineDiagnostic } from './chartDiagnostics';
import type { ChartRepairRecord } from './chartRepair';
import type { CategoryAggregation, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';
import type { DataQualityReport, QualityAdmission } from '../types/dataQuality';

/**
 * 导出面板的决策层（Day 9）：把「现在能不能导出、导出的是哪张图、点了之后发生什么」
 * 全部放在可测试的纯函数里，`ChartExportPanel.tsx` 只负责渲染与按钮状态。
 *
 * 本模块不重新计算任何统计：PNG 用的是页面上正在使用的同一份 option，
 * Markdown 用的是当次渲染的 `ChartDataResult` / `BaselineDiagnostic` / `ChartRepairRecord`。
 */

/** 按钮可用性判定的输入：全部来自 ChartLab 当次渲染的真实状态。 */
export interface ChartExportStateInput {
  /** 数据质量准入是否通过（被阻止时不提供 PNG 导出）。 */
  admissionAllowed: boolean;
  /** 是否已经生成真实绘图 option（等价于屏幕上那张图的数据来源已经确定）。 */
  optionReady: boolean;
  /** 图上实际绘制的展示单元数：为 0 时画布是空的，导出 PNG 没有意义。 */
  displayedCount: number;
  /** 是否已经选定合法的 X ／ Y 字段。 */
  selectionReady: boolean;
}

export interface ExportButtonState {
  enabled: boolean;
  /** 不可用原因（面向用户的中文说明）；可用时为空串。 */
  reason: string;
}

export interface ChartExportAvailability {
  png: ExportButtonState;
  report: ExportButtonState;
}

const PNG_NEED_CHART = '还没有可导出的图表：请先选择合法的 X ／ Y 字段，让上方出现真实图表后再导出 PNG。';
const PNG_ADMISSION_BLOCKED =
  '数据质量准入未通过：这份 CSV 的行列结构或解析结果可能让单元格错位，此时不导出可能被误读的图表。修好源文件后可用。';
const PNG_NO_POINTS = '当前选择下没有可绘制的数据点，PNG 里没有图形可导出；Markdown 报告仍会如实记录这次计算与排除情况。';

/**
 * 准入被阻止时屏幕上也已经没有正式图表（`ChartLab` 不渲染画布），
 * 因此说明文字不能再说「导出对象是当前画面上的这张柱状图…实际绘制 N 个数据点」，
 * 改成与报告正文同一套说法：只留证来源与阻止原因，不给正式结论。
 */
const ADMISSION_BLOCKED_CAPTION =
  '当前数据未通过质量准入，屏幕上没有正式图表：PNG 已禁用。' +
  'Markdown 报告仍可导出，用于留证文件来源、解析问题与阻止依据，正文标注为非正式结论，' +
  '不提供正式数据统计、图表配置结论、风险诊断或修复结论。修好源文件后重新上传即可导出完整报告。';

/**
 * PNG 与 Markdown 的可用性分开判定：
 * 报告是「本次分析过程的证据摘要」，准入被阻止时它记录的正是「为什么不能给结论」，所以仍然可导出，
 * 只是内容会被明确标注为非正式结论；PNG 则必须有一张真实画出来的图。
 */
export function evaluateChartExport(state: ChartExportStateInput): ChartExportAvailability {
  if (!state.admissionAllowed) {
    return { png: { enabled: false, reason: PNG_ADMISSION_BLOCKED }, report: { enabled: true, reason: '' } };
  }
  if (!state.selectionReady) {
    return { png: { enabled: false, reason: PNG_NEED_CHART }, report: { enabled: true, reason: '' } };
  }
  if (!state.optionReady) {
    return {
      png: { enabled: false, reason: state.displayedCount > 0 ? PNG_NEED_CHART : PNG_NO_POINTS },
      report: { enabled: true, reason: '' },
    };
  }
  if (state.displayedCount <= 0) {
    return { png: { enabled: false, reason: PNG_NO_POINTS }, report: { enabled: true, reason: '' } };
  }
  return { png: { enabled: true, reason: '' }, report: { enabled: true, reason: '' } };
}

export interface ExportCaptionInput {
  kind: ChartKind;
  kindLabel: string;
  title: string;
  xFieldLabel: string;
  yFieldLabel: string;
  aggregationLabel: string;
  displayedCount: number;
  aggregated: boolean;
  /** 受展示上限影响没有显示的记录数：它们既不在图上，也不会进 PNG。 */
  capHidden: number;
  admissionAllowed: boolean;
}

/** 「这张 PNG 到底是哪张图」的说明：字段、口径、单元数与触顶提醒全部来自当前状态；准入被阻止时改为留证说明。 */
export function describeExportTarget(input: ExportCaptionInput): string {
  if (!input.admissionAllowed) return ADMISSION_BLOCKED_CAPTION;
  const unit = input.aggregated ? '根柱子' : '个数据点';
  const xLabel = input.xFieldLabel === '' ? '未选择' : input.xFieldLabel;
  const yLabel = input.yFieldLabel === '' ? '未选择' : input.yFieldLabel;
  const base =
    `导出对象是当前画面上的这张${input.kindLabel}：《${input.title}》` +
    `（X 轴「${xLabel}」→ Y 轴「${yLabel}」· ${input.aggregationLabel} · 实际绘制 ${formatCount(input.displayedCount)} ${unit}）。` +
    'PNG 与 Markdown 都在点击的这一刻按当前状态重新生成，不会沿用之前配置的结果。';
  const capNote =
    input.capHidden > 0
      ? ` 另有 ${formatCount(input.capHidden)} 条有效记录受展示上限影响没有显示，它们同样不会出现在 PNG 里。`
      : '';
  return `${base}${capNote}`;
}

/** PNG 导出所需的当前画面状态：option 就是屏幕上那份，标题是生效标题。 */
export interface PngExportContext {
  option: Record<string, unknown>;
  title: string;
  /** 来源 CSV 文件名，只用于拼导出文件名片段。 */
  sourceFileName: string;
  width?: number;
  height?: number;
  pixelRatio?: number;
}

/** 报告所需的当前画面状态；`generatedAt` 在点击时才确定，因此不在这里带上。 */
export interface ReportBuildContext {
  table: CsvTable;
  admission: QualityAdmission;
  quality: DataQualityReport | null;
  chart: ReportChartContext | null;
  repair: ChartRepairRecord | null;
}

export function buildPngRequest(context: PngExportContext, date: Date): PngExportRequest {
  return {
    option: context.option,
    title: context.title,
    fileName: buildExportFileName('chart', 'png', context.sourceFileName, date),
    width: context.width,
    height: context.height,
    pixelRatio: context.pixelRatio,
  };
}

export function buildReportFile(context: ReportBuildContext, date: Date): { markdown: string; fileName: string } {
  const input: ReportInput = { ...context, generatedAt: date };
  return { markdown: buildMarkdownReport(input), fileName: buildReportFileName(context.table, date) };
}

/** 点击「导出 PNG」：按当前画面重绘一次离屏图并落盘，失败只返回中文说明。 */
export async function runPngExport(context: PngExportContext, date: Date): Promise<SaveFileOutcome> {
  return exportChartPng(buildPngRequest(context, date));
}

/** 点击「导出 Markdown 报告」：报告文本 + UTF-8 Blob 本地另存为。 */
export function runReportExport(context: ReportBuildContext, date: Date): SaveFileOutcome {
  const { markdown, fileName } = buildReportFile(context, date);
  return saveFile([markdown], 'text/markdown;charset=utf-8', fileName);
}

/**
 * 把 ChartLab 当次渲染的真实结果收敛成报告的图表上下文。
 * 字段下标不完整或没有算出绘图结果时返回 null：报告据此写「当前画面没有可导出的图表」，不编造配置。
 */
export function buildReportChartContext(args: {
  kind: ChartKind;
  xIndex: number | null;
  yIndex: number | null;
  xFieldLabel: string;
  yFieldLabel: string;
  aggregation: CategoryAggregation;
  snapshot: ChartConfigSnapshot;
  axisStart: ResolvedYAxisStart;
  result: ChartDataResult | null;
  scope: ChartScopeSummary | null;
  diagnostic: BaselineDiagnostic | null;
}): ReportChartContext | null {
  const { result, scope, xIndex, yIndex } = args;
  if (result === null || scope === null || xIndex === null || yIndex === null) return null;
  return {
    kind: args.kind,
    xIndex,
    yIndex,
    xFieldLabel: args.xFieldLabel,
    yFieldLabel: args.yFieldLabel,
    aggregation: args.aggregation,
    snapshot: args.snapshot,
    axisStart: args.axisStart,
    result,
    scope,
    diagnostic: args.diagnostic,
  };
}

export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
