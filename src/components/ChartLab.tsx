import { useMemo, useState } from 'react';

import { EChartCanvas } from './EChartCanvas';
import {
  computeChartData,
  defaultSelection,
  evaluateFieldAvailability,
  fieldChoicesForAxis,
  resolveFieldsForKind,
  summarizeChartScope,
  toEChartsOption,
  UNITLESS_HINT,
} from '../lib/chartData';
import type { CategoryGroup } from '../lib/chartData';
import { analyzeColumnTypes } from '../lib/columnTypes';
import { analyzeDataQuality, evaluateQualityAdmission } from '../lib/dataQuality';
import { formatComputedValue, formatCount } from '../lib/format';
import { buildReportChartContext, describeExportTarget, evaluateChartExport } from '../lib/chartExport';
import type { PngExportContext, ReportBuildContext } from '../lib/chartExport';
import {
  AGGREGATION_LABELS,
  CHART_KIND_LABELS,
  MAX_AXIS_TITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_UNIT_LENGTH,
  computeTitleDefaults,
  defaultChartConfig,
  reconcileConfigForContext,
  resolveChartTitles,
  resolveYAxisStart,
  validateChartConfig,
} from '../lib/chartConfig';
import type { ChartConfigNotice } from '../lib/chartConfig';
import { BASELINE_STATUS_LABELS, diagnoseBaseline } from '../lib/chartDiagnostics';
import type { BaselineDiagnostic } from '../lib/chartDiagnostics';
import {
  REPAIR_ACTION_LABEL,
  createRepairRecord,
  describeRepairStaleness,
  evaluateRepairEligibility,
  evaluateRepairUndo,
} from '../lib/chartRepair';
import type { ChartRepairRecord, ChartRepairSource, RepairEligibility } from '../lib/chartRepair';
import { ChartRepairPanel } from './ChartRepairPanel';
import { ChartExportPanel } from './ChartExportPanel';
import type { CategoryAggregation, ChartConfig, ChartKind, YAxisStartConfig } from '../types/chart';
import type { CsvTable } from '../types/csv';

interface ChartLabProps {
  table: CsvTable;
}

const AGGREGATIONS: CategoryAggregation[] = ['raw', 'mean', 'sum'];
/** 分组明细逐条列出的组数上限；类别组总数与记录数始终按全量统计。 */
const MAX_VISIBLE_GROUPS = 20;

/** 分组明细每行的排版。 */
const GROUP_ROW_CLASS = 'flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-relaxed text-slate-600';

/** 分组明细里的原始行号摘要：最多逐条列出前 6 行，条数始终按全组统计。 */
function groupRowsText(group: CategoryGroup): string {
  const shown = group.samples.slice(0, 6).map((sample) => formatCount(sample.rowIndex + 1)).join('、');
  return group.samples.length > 6 ? `行号 ${shown} 等 ${formatCount(group.samples.length)} 条` : `行号 ${shown}`;
}

const AGGREGATION_HINTS: Record<CategoryAggregation, string> = {
  raw: '每条有效记录一根柱子，重复类别不合并。',
  mean: '按 X 轴类别分组，对组内有效数值求算术平均值：平均值 = 组内累加 ÷ 组内有效样本数 n。',
  sum: '按 X 轴类别分组累加数值。只有该列本身可加（如计数、总量）时这个比较才有意义。',
};

function parseFieldIndex(value: string): number | null {
  return value === '' ? null : Number(value);
}

/** 诊断面板容器与徽标配色：按状态区分「有风险 / 无风险 / 不适用 / 配置无效 / 无数据」。 */
const DIAGNOSIS_TONE: Record<BaselineDiagnostic['status'], { box: string; badge: string }> = {
  risk: { box: 'border-amber-300 bg-amber-50', badge: 'bg-amber-200 text-amber-900' },
  clear: { box: 'border-brand-ring bg-brand-soft', badge: 'bg-brand text-white' },
  'not-applicable': { box: 'border-slate-200 bg-slate-50', badge: 'bg-slate-200 text-slate-700' },
  'invalid-config': { box: 'border-rose-300 bg-rose-50', badge: 'bg-rose-200 text-rose-900' },
  'no-data': { box: 'border-slate-200 bg-slate-50', badge: 'bg-slate-200 text-slate-700' },
};

/** 带标签的证据行：关键结论与依据默认全部可见，不需要展开。 */
function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-2 border-t border-amber-200/70 pt-1.5 text-xs leading-relaxed text-amber-900">
      <span className="font-semibold">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value}</span>
    </div>
  );
}

/** 诊断面板里的一键修复入口：只在真实满足修复条件时由上层传入。 */
interface RepairAction {
  label: string;
  /** 修复依据，直接取自 evaluateRepairEligibility 的真实判断。 */
  reason: string;
  onClick: () => void;
}

/**
 * 图表表达检查面板：呈现非零基线诊断的结论、证据、影响与建议，并在条件成立时给出一键修复入口。
 * 面板本身不判断能不能修、也不改任何配置或数据；修复动作与记录由 ChartLab 负责。
 */
function ChartExpressionCheck({ diagnostic, repairAction }: { diagnostic: BaselineDiagnostic; repairAction: RepairAction | null }) {
  const tone = DIAGNOSIS_TONE[diagnostic.status];
  const { dataRange, axisStart } = diagnostic;

  return (
    <section
      data-testid="chart-diagnostics"
      aria-label="图表表达检查"
      className={`mt-4 min-w-0 rounded-xl border p-4 ${tone.box}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">图表表达检查</h3>
        <span data-testid="diagnostic-status" className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.badge}`}>
          {BASELINE_STATUS_LABELS[diagnostic.status]}
        </span>
      </div>

      {diagnostic.status === 'risk' ? (
        <div className="mt-2 space-y-2">
          <p data-testid="diagnostic-title" className="break-words text-sm font-semibold leading-relaxed text-amber-900">
            {diagnostic.title}
          </p>
          <p className="break-words text-sm leading-relaxed text-amber-900">{diagnostic.summary}</p>
          <div className="space-y-1.5 rounded-lg border border-amber-200 bg-white/60 px-3 py-2">
            <EvidenceRow
              label="当前配置"
              value={`Y 轴起点 = ${formatComputedValue(axisStart.appliedMin ?? 0)}（手动设置）`}
            />
            <EvidenceRow
              label="数据范围"
              value={dataRange ? `${formatComputedValue(dataRange.min)} – ${formatComputedValue(dataRange.max)}` : '无'}
            />
            <EvidenceRow
              label="判断依据"
              value={
                dataRange
                  ? `可见纵轴下界 ${formatComputedValue(axisStart.appliedMin ?? 0)} 大于 0，且不高于数据最小值 ${formatComputedValue(
                      dataRange.min,
                    )}（数值仍在可见范围内、没有被裁到轴外），但坐标轴可见范围不包含零基线。`
                  : `可见纵轴下界 ${formatComputedValue(axisStart.appliedMin ?? 0)} 大于 0，坐标轴可见范围不包含零基线。`
              }
            />
            <EvidenceRow label="可能影响" value={diagnostic.impact} />
            <EvidenceRow label="建议处理" value={diagnostic.recommendation} />
          </div>
          {repairAction ? (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="repair-baseline"
                onClick={repairAction.onClick}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                {repairAction.label}
              </button>
              <p className="min-w-0 flex-1 break-words text-xs leading-relaxed text-amber-800">
                {repairAction.reason}修复只改图表配置，不改动任何单元格、记录数或聚合结果。
              </p>
            </div>
          ) : null}
          <p className="text-xs leading-relaxed text-amber-800">
            这是基于当前图表配置的表达提示，用于帮助你核查纵轴起点；不据此认定数据错误，也不构成对科研结论真伪的判断。
          </p>
        </div>
      ) : null}

      {diagnostic.status === 'clear' ? (
        <div className="mt-2 space-y-1.5">
          <p data-testid="diagnostic-title" className="text-sm font-semibold leading-relaxed text-brand-dark">
            当前图表未发现本次规则覆盖的表达风险。
          </p>
          <p className="text-xs leading-relaxed text-slate-600">{diagnostic.summary}</p>
          <p className="text-xs leading-relaxed text-slate-600">
            本次主要检查普通柱状图的零基线设置，不能代表图表或科研结论完全正确。
          </p>
        </div>
      ) : null}

      {diagnostic.status === 'not-applicable' ? (
        <div className="mt-2 space-y-1.5">
          <p data-testid="diagnostic-title" className="text-sm font-semibold leading-relaxed text-slate-700">
            当前图表类型不适用柱状图零基线检查。
          </p>
          <p className="text-xs leading-relaxed text-slate-600">{diagnostic.summary}</p>
          <p className="text-xs leading-relaxed text-slate-500">
            「不适用」表示本条规则不对这种图表下判断，不代表图表或科研结论已经通过全部检查。
          </p>
        </div>
      ) : null}

      {diagnostic.status === 'invalid-config' ? (
        <div className="mt-2 space-y-1.5">
          <p data-testid="diagnostic-title" className="text-sm font-semibold leading-relaxed text-rose-900">
            Y 轴起点配置无效
          </p>
          <p className="break-words text-xs leading-relaxed text-rose-900">{diagnostic.summary}</p>
          <p className="text-xs leading-relaxed text-rose-800">{diagnostic.recommendation}</p>
        </div>
      ) : null}

      {diagnostic.status === 'no-data' ? (
        <div className="mt-2 space-y-1.5">
          <p data-testid="diagnostic-title" className="text-sm font-semibold leading-relaxed text-slate-700">
            没有可检查的数值
          </p>
          <p className="text-xs leading-relaxed text-slate-600">{diagnostic.summary}</p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * 图表实验室：字段选择 + 图表配置（标题 / 轴标题 / 单位 / 聚合口径）+ 真实统计说明。
 * 配置只改变图表表达，不参与任何数值计算；所有统计来自 lib/chartData 的真实遍历。
 */
export function ChartLab({ table }: ChartLabProps) {
  const [kind, setKind] = useState<ChartKind>('bar');
  const [xIndex, setXIndex] = useState<number | null>(null);
  const [yIndex, setYIndex] = useState<number | null>(null);
  const [aggregation, setAggregation] = useState<CategoryAggregation>('raw');
  const [config, setConfig] = useState<ChartConfig>(defaultChartConfig);
  const [contextNotices, setContextNotices] = useState<ChartConfigNotice[]>([]);
  const [sourceTable, setSourceTable] = useState<CsvTable | null>(null);
  /** 本轮唯一的修复记录：只保留最近一次，不构建通用历史系统。 */
  const [repair, setRepair] = useState<ChartRepairRecord | null>(null);
  /** 撤销结果、修复被拒与对比被清除的说明；修复成功本身由对比区播报，不重复。 */
  const [repairNote, setRepairNote] = useState<{ tone: 'status' | 'alert'; text: string } | null>(null);

  const admission = useMemo(() => evaluateQualityAdmission(table), [table]);
  const columnTypes = useMemo(() => analyzeColumnTypes(table), [table]);

  // 换成另一份 CSV：图表类型、字段选择、标题、单位、聚合口径全部回到新文件的默认值。
  if (sourceTable !== table) {
    const nextDefault = defaultSelection(columnTypes, 'bar');
    setSourceTable(table);
    setKind('bar');
    setXIndex(nextDefault.x);
    setYIndex(nextDefault.y);
    setAggregation('raw');
    setConfig(defaultChartConfig());
    setContextNotices([]);
  }

  const xOptions = fieldChoicesForAxis(columnTypes, kind, 'x');
  const yOptions = fieldChoicesForAxis(columnTypes, kind, 'y');
  const fieldStatus = evaluateFieldAvailability(columnTypes, kind);
  const xSelected = xIndex !== null && xOptions.some((choice) => choice.index === xIndex);
  const ySelected = yIndex !== null && yOptions.some((choice) => choice.index === yIndex);
  const sameAxis = kind === 'scatter' && xIndex !== null && xIndex === yIndex;
  const selectionValid = fieldStatus.ready && xSelected && ySelected && !sameAxis;
  const effectiveAggregation: CategoryAggregation = kind === 'bar' ? aggregation : 'raw';

  const xFieldLabel = xIndex !== null ? (columnTypes.columns[xIndex]?.label ?? '') : '';
  const yFieldLabel = yIndex !== null ? (columnTypes.columns[yIndex]?.label ?? '') : '';
  const titleDefaults = computeTitleDefaults(kind, { x: xFieldLabel, y: yFieldLabel }, effectiveAggregation);
  const snapshot = resolveChartTitles(config, titleDefaults);

  const result =
    selectionValid && xIndex !== null && yIndex !== null
      ? computeChartData(table, kind, xIndex, yIndex, effectiveAggregation)
      : null;

  // 纵轴起点是「输入 = 绘图 = 诊断」的唯一来源：结合真实 Y 范围解析后，只有合法且不裁剪的值才会写进 ECharts。
  const resolvedStart = resolveYAxisStart(config.yAxisStart, result ? result.yRange : null);
  const effectiveYMin =
    kind === 'bar' && resolvedStart.mode === 'manual' && resolvedStart.appliedMin !== null ? resolvedStart.appliedMin : undefined;

  const option =
    result && result.validCount > 0
      ? toEChartsOption(result, {
          xLabel: xFieldLabel,
          yLabel: yFieldLabel,
          xName: snapshot.xAxisLabel,
          yName: snapshot.yAxisLabel,
          yMin: effectiveYMin,
        })
      : null;
  const scope = result ? summarizeChartScope(result, { xLabel: xFieldLabel, yLabel: yFieldLabel, title: snapshot.title }) : null;
  const diagnostic: BaselineDiagnostic | null = result
    ? diagnoseBaseline({ kind, yRange: result.yRange, axisStart: resolvedStart, yFieldLabel })
    : null;

  // 修复的全部输入来自当次渲染的真实计算结果；解析被阻止时不给修复源，也就不会有修复入口。
  const repairSource: ChartRepairSource | null =
    admission.allowed && result !== null && diagnostic !== null && xIndex !== null && yIndex !== null
      ? {
          table,
          admissionAllowed: true,
          kind,
          xIndex,
          yIndex,
          aggregation: effectiveAggregation,
          config,
          result,
          diagnostic,
          xFieldLabel,
          yFieldLabel,
          titleDefaults,
        }
      : null;
  const repairEligibility: RepairEligibility | null = repairSource === null ? null : evaluateRepairEligibility(repairSource);

  // 修复记录与当前画面一旦不一致就清除，并如实说明原因：不留下对不上画面的旧对比，也不留下可点的旧撤销。
  if (repair !== null) {
    const stale = describeRepairStaleness(repair, { table, kind, xIndex, yIndex, aggregation: effectiveAggregation }, config);
    if (stale !== null) {
      setRepair(null);
      setRepairNote({ tone: 'status', text: `修复前后对比已清除：${stale}` });
    }
  }

  const inputNotices = validateChartConfig(config, snapshot);
  const notices: ChartConfigNotice[] = [];
  for (const notice of [...contextNotices, ...inputNotices]) {
    if (!notices.some((existing) => existing.key === notice.key)) notices.push(notice);
  }

  /**
   * 类型 / 字段 / 聚合变化后的统一提交：字段沿用仍然合法的选项，
   * 手动写的图表标题保留但不静默覆盖，换掉那根轴的标题与单位清空并留下说明。
   */
  function commit(nextKind: ChartKind, nextX: number | null, nextY: number | null, nextAggregation: CategoryAggregation) {
    const nextEffective: CategoryAggregation = nextKind === 'bar' ? nextAggregation : 'raw';
    const nextXLabel = nextX !== null ? (columnTypes.columns[nextX]?.label ?? '') : '';
    const nextYLabel = nextY !== null ? (columnTypes.columns[nextY]?.label ?? '') : '';
    const nextDefaults = computeTitleDefaults(nextKind, { x: nextXLabel, y: nextYLabel }, nextEffective);
    const currentDefaults = computeTitleDefaults(kind, { x: xFieldLabel, y: yFieldLabel }, effectiveAggregation);
    const reconciled = reconcileConfigForContext(config, resolveChartTitles(config, nextDefaults), {
      xAxisFieldChanged: nextX !== xIndex,
      yAxisFieldChanged: nextY !== yIndex,
      defaultTitleChanged: nextDefaults.title !== currentDefaults.title,
      aggregationDropped: nextKind !== 'bar' && effectiveAggregation !== 'raw',
    });

    setKind(nextKind);
    setXIndex(nextX);
    setYIndex(nextY);
    setAggregation(nextEffective);
    setConfig(reconciled.config);
    setContextNotices(reconciled.notices);
  }

  function handleKindChange(next: ChartKind) {
    if (next === kind) return;
    const fields = resolveFieldsForKind(columnTypes, next, { x: xIndex, y: yIndex });
    commit(next, fields.x, fields.y, aggregation);
  }

  function handleAxisChange(axis: 'x' | 'y', index: number | null) {
    if (axis === 'x') commit(kind, index, yIndex, aggregation);
    else commit(kind, xIndex, index, aggregation);
  }

  function handleAggregationChange(next: CategoryAggregation) {
    if (next === aggregation) return;
    commit(kind, xIndex, yIndex, next);
  }

  function patchConfig(patch: Partial<ChartConfig>, axis?: 'x' | 'y', axisPatch?: Partial<ChartConfig['xAxis']>) {
    setConfig((current) => {
      if (!axis) return { ...current, ...patch };
      const key = axis === 'x' ? 'xAxis' : 'yAxis';
      return { ...current, ...patch, [key]: { ...current[key], ...axisPatch } };
    });
  }

  /** Y 轴起点是独立的结构化配置项：只改起点，不动标题 / 单位 / 聚合，也不触碰任何 CSV 数值。 */
  function patchYAxisStart(patch: Partial<YAxisStartConfig>) {
    setConfig((current) => ({ ...current, yAxisStart: { ...current.yAxisStart, ...patch } }));
  }

  /**
   * 一键修复：先钉存修复前快照与两张图的真实 option，再把起点配置改成自动。
   * createRepairRecord 内部复核全部触发条件，状态不满足（含重复点击）时不写配置、不追加记录。
   */
  function handleRepair() {
    if (repairSource === null) return;
    const record = createRepairRecord(repairSource);
    if (record === null) {
      setRepairNote({ tone: 'alert', text: '当前状态已不满足修复条件，没有修改任何图表配置，也没有生成修复记录。' });
      return;
    }
    setRepair(record);
    setConfig(record.afterConfig);
    setRepairNote(null);
  }

  /** 撤销只把配置交回修复前那一份；旧配置在当前数据下不安全时拒绝，不强行写回。 */
  function handleUndoRepair() {
    if (repair === null) return;
    const evaluation = evaluateRepairUndo(
      repair,
      { table, kind, xIndex, yIndex, aggregation: effectiveAggregation },
      config,
      result ? result.yRange : null,
    );
    if (!evaluation.ok) {
      setRepairNote({ tone: 'alert', text: evaluation.message });
      return;
    }
    setConfig(repair.beforeConfig);
    setRepair(null);
    setRepairNote({ tone: 'status', text: evaluation.message });
  }

  const repairAction: RepairAction | null =
    repair === null && repairEligibility !== null && repairEligibility.eligible
      ? { label: REPAIR_ACTION_LABEL, reason: repairEligibility.reason, onClick: handleRepair }
      : null;

  let notice: string | null = null;
  if (!fieldStatus.ready) notice = fieldStatus.notice;
  else if (sameAxis) notice = '散点图的 X 与 Y 必须选择两个不同的数值字段。';
  else if (!xSelected || !ySelected) notice = '请在上方选择用于绘图的 X 轴与 Y 轴字段。';
  else if (result && result.validCount === 0) notice = '所选字段下所有记录都因缺失或类型不符被排除，没有可绘制的数据点。';

  const renderChart = admission.allowed && option !== null && result !== null && result.validCount > 0;
  const aggregated = result !== null && result.aggregation !== 'raw';
  const unitLine =
    `X 轴单位：${snapshot.xUnit === '' ? UNITLESS_HINT : `「${snapshot.xUnit}」（由你确认，不做换算）`}；` +
    `Y 轴单位：${snapshot.yUnit === '' ? UNITLESS_HINT : `「${snapshot.yUnit}」（由你确认，不做换算）`}。`;

  // Day 9 导出：报告要用的质量统计只在换文件时算一次，点击导出直接复用，不重复扫描全表。
  const quality = useMemo(() => (admission.allowed ? analyzeDataQuality(table) : null), [admission.allowed, table]);
  // 准入未通过时，屏幕上的字段选择与诊断结果一律不作为报告的正式输入：修复记录同理。
  // 报告纯函数内部还会按 admission.allowed 再挡一道，但调用层不能把这道责任全推给它。
  const reportChart = admission.allowed
    ? buildReportChartContext({
        kind,
        xIndex,
        yIndex,
        xFieldLabel,
        yFieldLabel,
        aggregation: effectiveAggregation,
        snapshot,
        axisStart: resolvedStart,
        result,
        scope,
        diagnostic,
      })
    : null;
  const reportContext: ReportBuildContext = {
    table,
    admission,
    quality,
    chart: reportChart,
    repair: admission.allowed ? repair : null,
  };
  const pngContext: PngExportContext | null =
    option !== null ? { option, title: snapshot.title, sourceFileName: table.fileName } : null;
  const exportAvailability = evaluateChartExport({
    admissionAllowed: admission.allowed,
    optionReady: option !== null,
    displayedCount: result ? result.displayedCount : 0,
    selectionReady: selectionValid,
  });
  const exportCaption = describeExportTarget({
    kind,
    kindLabel: CHART_KIND_LABELS[kind],
    title: snapshot.title,
    xFieldLabel,
    yFieldLabel,
    aggregationLabel: AGGREGATION_LABELS[effectiveAggregation],
    displayedCount: result ? result.displayedCount : 0,
    aggregated,
    capHidden: result ? result.capHidden : 0,
    admissionAllowed: admission.allowed,
  });

  return (
    <section aria-label="图表实验室" className="mt-4 rounded-2xl border border-brand-ring bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">图表实验室</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        选择字段与图表类型生成真实图表。图表基于整份数据集计算，不受上方表格 50 行分页影响；
        标题、轴标题与单位只改变图表表达，不修改任何单元格内容，单位一律由你确认、系统不做换算。
      </p>

      {!admission.allowed ? (
        <div data-testid="chart-blocked" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">这份 CSV 暂时不能生成正式图表</h3>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            数据结构降级或存在会读错数据的解析错误时，单元格可能已经错位，直接绘图会得到不可信的结果。
            请先按下面的说明修好源文件再重新上传。原始数据表格与解析告警照常可以浏览。
          </p>
          <ul className="mt-3 space-y-2">
            {admission.blockers.map((blocker) => (
              <li key={blocker.code} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">{blocker.message}</p>
                {blocker.evidence.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-amber-900/80">
                    {blocker.evidence.map((evidence) => (
                      <li key={evidence} className="break-words">
                        · {evidence}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : table.recordCount === 0 ? (
        <p
          data-testid="chart-empty"
          className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600"
        >
          文件里只有表头、没有数据行，无法生成图表。
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-600">图表类型</span>
              <div role="group" aria-label="图表类型" className="mt-1 inline-flex flex-wrap rounded-xl border border-slate-300 p-0.5">
                {(['bar', 'scatter', 'line'] as ChartKind[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={kind === type}
                    onClick={() => handleKindChange(type)}
                    className={
                      kind === type
                        ? 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white'
                        : 'rounded-lg px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100'
                    }
                  >
                    {CHART_KIND_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 flex-1 sm:max-w-xs">
              <label htmlFor="chart-x-field" className="block text-xs font-medium text-slate-600">
                X 轴字段
              </label>
              <select
                id="chart-x-field"
                value={xSelected ? String(xIndex) : ''}
                disabled={!fieldStatus.ready}
                onChange={(event) => handleAxisChange('x', parseFieldIndex(event.target.value))}
                aria-describedby="chart-x-field-hint"
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="" disabled>
                  请选择
                </option>
                {xOptions.map((choice) => (
                  <option key={choice.index} value={choice.index}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <p id="chart-x-field-hint" className="mt-1 text-xs text-slate-500">
                {kind === 'bar'
                  ? '柱状图 X 轴使用文本或类别字段。'
                  : kind === 'line'
                    ? '折线图 X 轴使用日期字段（年在前、能定位到具体日期的写法，如 2026-03-02）。'
                    : '散点图 X 轴使用数值字段。'}
              </p>
            </div>

            <div className="min-w-0 flex-1 sm:max-w-xs">
              <label htmlFor="chart-y-field" className="block text-xs font-medium text-slate-600">
                Y 轴字段
              </label>
              <select
                id="chart-y-field"
                value={ySelected ? String(yIndex) : ''}
                disabled={!fieldStatus.ready}
                onChange={(event) => handleAxisChange('y', parseFieldIndex(event.target.value))}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="" disabled>
                  请选择
                </option>
                {yOptions.map((choice) => (
                  <option key={choice.index} value={choice.index}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div id="chart-preview" className="mt-4 min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-3">
            <h3
              data-testid="chart-title"
              className="line-clamp-2 break-words px-1 pt-1 text-base font-semibold text-slate-900"
              title={snapshot.title}
            >
              {snapshot.title}
            </h3>
            <p className="mt-0.5 break-words px-1 text-xs leading-relaxed text-slate-500" title={unitLine}>
              {unitLine}
            </p>
            {renderChart && option ? (
              <EChartCanvas
                key={`${table.fileName}#${kind}`}
                option={option}
                ariaLabel={`${CHART_KIND_LABELS[kind]}预览`}
                description={scope ? scope.description : ''}
              />
            ) : notice ? (
              <p
                data-testid="chart-empty"
                className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm leading-relaxed text-slate-600"
              >
                {notice}
              </p>
            ) : null}
          </div>

          <fieldset data-testid="chart-config" className="mt-4 min-w-0 rounded-xl border border-slate-200 bg-white p-4">
            <legend className="px-1 text-xs font-semibold text-slate-700">图表配置（只影响表达，不改动数据）</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="chart-title-input" className="block text-xs font-medium text-slate-600">
                      图表标题
                    </label>
                    <input
                      id="chart-title-input"
                      type="text"
                      value={config.title}
                      placeholder={titleDefaults.title}
                      onChange={(event) => patchConfig({ title: event.target.value, titleEdited: true })}
                      className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                    />
                  </div>
                  {config.titleEdited ? (
                    <button
                      type="button"
                      onClick={() => patchConfig({ title: '', titleEdited: false })}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      恢复自动标题
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  留空时按图表类型与字段自动生成（见上方图表标题）；手动填写后不会随字段变化，可用左侧按钮恢复自动标题。
                </p>
              </div>

              {(['x', 'y'] as const).map((axis) => (
                <div key={axis} className="min-w-0">
                  <label htmlFor={`chart-${axis}-title`} className="block text-xs font-medium text-slate-600">
                    {axis === 'x' ? 'X' : 'Y'} 轴标题
                  </label>
                  <input
                    id={`chart-${axis}-title`}
                    type="text"
                    value={axis === 'x' ? config.xAxis.title : config.yAxis.title}
                    placeholder={axis === 'x' ? titleDefaults.xTitle : titleDefaults.yTitle}
                    onChange={(event) => patchConfig({}, axis, { title: event.target.value, titleEdited: true })}
                    className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                  <label htmlFor={`chart-${axis}-unit`} className="mt-2 block text-xs font-medium text-slate-600">
                    {axis === 'x' ? 'X' : 'Y'} 轴单位（可选）
                  </label>
                  <input
                    id={`chart-${axis}-unit`}
                    type="text"
                    value={axis === 'x' ? config.xAxis.unit : config.yAxis.unit}
                    placeholder="例如 cm、kg、mg/L；留空表示不标注"
                    onChange={(event) => patchConfig({}, axis, { unit: event.target.value })}
                    className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                </div>
              ))}
            </div>

            {kind === 'bar' ? (
              <>
                <fieldset className="mt-3 border-t border-slate-200 pt-3">
                  <legend className="px-1 text-xs font-semibold text-slate-700">分类聚合方式</legend>
                  <div className="flex flex-wrap gap-2">
                    {AGGREGATIONS.map((choice) => (
                      <label
                        key={choice}
                        className={
                          aggregation === choice
                            ? 'rounded-xl border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-dark'
                            : 'rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100'
                        }
                      >
                        <input
                          type="radio"
                          name="chart-aggregation"
                          value={choice}
                          checked={aggregation === choice}
                          onChange={() => handleAggregationChange(choice)}
                          className="sr-only"
                        />
                        {AGGREGATION_LABELS[choice]}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{AGGREGATION_HINTS[aggregation]}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    聚合只统计有效记录：缺失与类型不符的记录既不进入计算，也不进入样本数 n 的分母；
                    聚合结果是新对象，原始记录一条都不会被删除或改写。
                  </p>
                </fieldset>

                <fieldset className="mt-3 border-t border-slate-200 pt-3" data-testid="yaxis-start-config">
                  <legend className="px-1 text-xs font-semibold text-slate-700">Y 轴起点（只改变纵轴下界，不改动任何数值）</legend>
                  <div role="group" aria-label="Y 轴起点模式" className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: 'auto', label: '自动（含零基线）' },
                        { key: 'manual', label: '手动设置' },
                      ] as const
                    ).map((choice) => (
                      <label
                        key={choice.key}
                        className={
                          config.yAxisStart.mode === choice.key
                            ? 'rounded-xl border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-dark'
                            : 'rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100'
                        }
                      >
                        <input
                          type="radio"
                          name="chart-yaxis-start-mode"
                          value={choice.key}
                          checked={config.yAxisStart.mode === choice.key}
                          onChange={() => patchYAxisStart({ mode: choice.key })}
                          className="sr-only"
                        />
                        {choice.label}
                      </label>
                    ))}
                  </div>

                  {config.yAxisStart.mode === 'manual' ? (
                    <div className="mt-2">
                      <label htmlFor="chart-yaxis-start-input" className="block text-xs font-medium text-slate-600">
                        纵轴下界数值
                      </label>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        下界必须不大于进入图表的 Y 数值最小值；高于最小值会隐藏低于它的有效数值，配置不会被应用。
                      </p>
                      <input
                        id="chart-yaxis-start-input"
                        data-testid="yaxis-start-input"
                        type="text"
                        inputMode="decimal"
                        value={config.yAxisStart.raw}
                        placeholder="例如 95、0、-10"
                        onChange={(event) => patchYAxisStart({ raw: event.target.value })}
                        className="mt-1 block w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                      />
                      {resolvedStart.error !== null ? (
                        <p
                          data-testid="yaxis-start-error"
                          role="alert"
                          className="mt-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs leading-relaxed text-rose-800"
                        >
                          {resolvedStart.error}
                        </p>
                      ) : (
                        <>
                          <p data-testid="yaxis-start-applied" className="mt-1 text-xs leading-relaxed text-slate-500">
                            当前纵轴起点：{formatComputedValue(resolvedStart.appliedMin ?? 0)}（已作为图表纵轴下界应用；诊断依据与此一致）。
                          </p>
                          {/* 起点合法但仍有表达代价（等于数据最小值 → 零长度柱形）：如实说明，不说成「数据已完整可辨」。 */}
                          {resolvedStart.notice !== null ? (
                            <p
                              data-testid="yaxis-start-notice"
                              className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs leading-relaxed text-amber-900"
                            >
                              {resolvedStart.notice}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      自动模式：不固定下界，由坐标轴自动包含零基线；存在负值时一并显示，不裁剪数据。
                    </p>
                  )}
                </fieldset>
              </>
            ) : null}

            {notices.length > 0 ? (
              <div data-testid="chart-notices" className="mt-3 space-y-1">
                {notices.map((item) => (
                  <p key={item.key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs leading-relaxed text-slate-600">
                    {item.message}
                  </p>
                ))}
              </div>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              文本上限：标题 {MAX_TITLE_LENGTH} 字、轴标题 {MAX_AXIS_TITLE_LENGTH} 字、单位 {MAX_UNIT_LENGTH} 字；
              超出部分只在显示时缩略，画布放不下时完整文本仍可在上方标题与下方说明里读到。
            </p>
          </fieldset>

          {diagnostic ? <ChartExpressionCheck diagnostic={diagnostic} repairAction={repairAction} /> : null}

          {repairNote ? (
            <p
              data-testid="chart-repair-note"
              role={repairNote.tone}
              aria-live={repairNote.tone === 'alert' ? 'assertive' : 'polite'}
              className={`mt-4 min-w-0 break-words rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                repairNote.tone === 'alert'
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              {repairNote.text}
            </p>
          ) : null}

          {repair !== null ? (
            <ChartRepairPanel
              record={repair}
              afterDiagnostic={diagnostic}
              description={scope ? scope.description : ''}
              onUndo={handleUndoRepair}
            />
          ) : null}

          {result && scope ? (
            <div data-testid="chart-stats" className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">参与绘图与排除记录</h3>
              <p className="text-sm leading-relaxed text-slate-600">{scope.headline}</p>
              {scope.breakdown.map((line) => (
                <p key={line} className="text-xs leading-relaxed text-slate-500">
                  {line}
                </p>
              ))}
              {scope.methodNotes.map((line) => (
                <p key={line} className="text-xs leading-relaxed text-slate-500">
                  {line}
                </p>
              ))}
              {aggregated && result.groups.length + result.overflowGroups.length > 0 ? (
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">分组明细（每组的样本数 n 与原始行号）</p>
                  {result.groups.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {result.groups.slice(0, MAX_VISIBLE_GROUPS).map((group) => (
                        <div key={group.key} className={GROUP_ROW_CLASS}>
                          <span className="break-words font-medium text-slate-800">{group.key}</span>
                          <span>n = {formatCount(group.samples.length)}</span>
                          <span>
                            {result.aggregation === 'mean' ? '平均值' : '合计'} {formatComputedValue(group.value)}
                          </span>
                          <span className="break-words">{groupRowsText(group)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {result.groups.length > MAX_VISIBLE_GROUPS ? (
                    <p className="mt-2 text-xs text-slate-500">
                      这里只逐条列出前 {formatCount(MAX_VISIBLE_GROUPS)} 组，类别组共 {formatCount(result.categoryTotal ?? 0)} 组；
                      未列出的组仍按真实结果参与统计，列表缩略不代表数据被丢弃。
                    </p>
                  ) : null}
                  {result.overflowGroups.length > 0 ? (
                    <div className="mt-2 space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2">
                      <p className="text-xs font-semibold leading-relaxed text-amber-900">
                        以下 {formatCount(result.overflowGroups.length)} 个类别的聚合结果无法用有限数值表示，没有画柱子；
                        组内记录仍然有效，样本数与行号照旧列出。
                      </p>
                      {result.overflowGroups.slice(0, MAX_VISIBLE_GROUPS).map((group) => (
                        <div key={group.key} className={GROUP_ROW_CLASS}>
                          <span className="break-words font-medium text-amber-900">{group.key}</span>
                          <span>n = {formatCount(group.samples.length)}</span>
                          <span>{result.aggregation === 'mean' ? '平均值' : '合计'}无法有限表示</span>
                          <span className="break-words">{groupRowsText(group)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {scope.capNote ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-relaxed text-amber-900">
                  {scope.capNote}
                </p>
              ) : null}
              {scope.overflowNote ? (
                <p
                  data-testid="chart-overflow-note"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-relaxed text-amber-900"
                >
                  {scope.overflowNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <ChartExportPanel
        availability={exportAvailability}
        pngContext={pngContext}
        reportContext={reportContext}
        caption={exportCaption}
        admissionAllowed={admission.allowed}
      />
    </section>
  );
}
