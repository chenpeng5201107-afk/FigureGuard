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
import { analyzeColumnTypes } from '../lib/columnTypes';
import { evaluateQualityAdmission } from '../lib/dataQuality';
import { formatComputedValue, formatCount } from '../lib/format';
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
  validateChartConfig,
} from '../lib/chartConfig';
import type { ChartConfigNotice } from '../lib/chartConfig';
import type { CategoryAggregation, ChartConfig, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';

interface ChartLabProps {
  table: CsvTable;
}

const AGGREGATIONS: CategoryAggregation[] = ['raw', 'mean', 'sum'];
/** 分组明细逐条列出的组数上限；类别组总数与记录数始终按全量统计。 */
const MAX_VISIBLE_GROUPS = 20;

const AGGREGATION_HINTS: Record<CategoryAggregation, string> = {
  raw: '每条有效记录一根柱子，重复类别不合并（Day 5 默认行为）。',
  mean: '按 X 轴类别分组，对组内有效数值求算术平均值：平均值 = 组内累加 ÷ 组内有效样本数 n。',
  sum: '按 X 轴类别分组累加数值。只有该列本身可加（如计数、总量）时这个比较才有意义。',
};

function parseFieldIndex(value: string): number | null {
  return value === '' ? null : Number(value);
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
  const option =
    result && result.validCount > 0
      ? toEChartsOption(result, {
          xLabel: xFieldLabel,
          yLabel: yFieldLabel,
          xName: snapshot.xAxisLabel,
          yName: snapshot.yAxisLabel,
        })
      : null;
  const scope = result ? summarizeChartScope(result, { xLabel: xFieldLabel, yLabel: yFieldLabel, title: snapshot.title }) : null;

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
                    ? '折线图 X 轴使用日期字段（年在后、能定位到具体日期的写法）。'
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
              {aggregated && result.groups.length > 0 ? (
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">分组明细（每组的样本数 n 与原始行号）</p>
                  <div className="mt-2 space-y-1">
                    {result.groups.slice(0, MAX_VISIBLE_GROUPS).map((group) => (
                      <div key={group.key} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-relaxed text-slate-600">
                        <span className="break-words font-medium text-slate-800">{group.key}</span>
                        <span>n = {formatCount(group.samples.length)}</span>
                        <span>
                          {result.aggregation === 'mean' ? '平均值' : '合计'} {formatComputedValue(group.value)}
                        </span>
                        <span className="break-words">
                          行号 {group.samples.slice(0, 6).map((sample) => formatCount(sample.rowIndex + 1)).join('、')}
                          {group.samples.length > 6 ? ` 等 ${formatCount(group.samples.length)} 条` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                  {result.groups.length > MAX_VISIBLE_GROUPS ? (
                    <p className="mt-2 text-xs text-slate-500">
                      这里只逐条列出前 {formatCount(MAX_VISIBLE_GROUPS)} 组，类别组共 {formatCount(result.categoryTotal ?? 0)} 组；
                      未列出的组仍按真实结果参与统计，列表缩略不代表数据被丢弃。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {scope.capNote ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-relaxed text-amber-900">
                  {scope.capNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
