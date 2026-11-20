// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildPngRequest,
  buildReportChartContext,
  buildReportFile,
  describeExportTarget,
  errorText,
  evaluateChartExport,
  runPngExport,
  runReportExport,
} from './chartExport';
import type { PngExportContext, ReportBuildContext } from './chartExport';
import { computeChartData, summarizeChartScope } from './chartData';
import { analyzeColumnTypes } from './columnTypes';
import { diagnoseBaseline } from './chartDiagnostics';
import { computeTitleDefaults, defaultChartConfig, resolveChartTitles, resolveYAxisStart } from './chartConfig';
import { analyzeDataQuality, evaluateQualityAdmission } from './dataQuality';
import { parseCsvText } from './csv';
import { PNG_EXPORT_HEIGHT, PNG_EXPORT_WIDTH, PNG_PIXEL_RATIO } from './chartPngExport';
import type { ChartConfigSnapshot, ResolvedYAxisStart } from './chartConfig';
import type { ChartDataResult, ChartScopeSummary } from './chartData';
import type { BaselineDiagnostic } from './chartDiagnostics';
import type { ReportChartContext } from './reportExport';
import type { CategoryAggregation, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';

/**
 * 导出面板决策层（`chartExport.ts`）的单元测试。
 * 这里只验「能不能导出、说明文字怎么说、点了之后交给谁」；
 * PNG 像素与 Markdown 正文分别由 chartPngExport / reportExport 的测试负责，本文件不重复实现判定。
 */

// 离屏 ECharts 实例由这里假造：只关心 runPngExport 是否把当前 option 原样交出去并收干净生命周期。
const echartsMock = vi.hoisted(() => {
  interface FakeInstance {
    setOption: ReturnType<typeof vi.fn>;
    getZr: ReturnType<typeof vi.fn>;
    getDataURL: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    options: Record<string, unknown>[];
  }
  const instances: FakeInstance[] = [];
  // getDataURL 的返回值可被单个测试改写：空串代表 ECharts 没有给出图像数据。
  const state = { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
  const init = vi.fn(() => {
    const instance: FakeInstance = {
      setOption: vi.fn((option: Record<string, unknown>) => {
        instance.options.push(option);
      }),
      getZr: vi.fn(() => ({ flush: () => undefined })),
      getDataURL: vi.fn(() => state.dataUrl),
      dispose: vi.fn(),
      options: [],
    };
    instances.push(instance);
    return instance;
  });
  return { init, use: vi.fn(), instances, state };
});

vi.mock('./echartsCore', () => ({ echarts: { init: echartsMock.init, use: echartsMock.use } }));

const nativeCreateObjectURL = URL.createObjectURL;
const nativeRevokeObjectURL = URL.revokeObjectURL;
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
const clickedAnchors: HTMLAnchorElement[] = [];

beforeEach(() => {
  echartsMock.init.mockClear();
  echartsMock.instances.length = 0;
  echartsMock.state.dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  clickedAnchors.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:figureguard/stub') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
    clickedAnchors.push(this);
  }) as unknown as typeof HTMLAnchorElement.prototype.click;
});

afterEach(() => {
  HTMLAnchorElement.prototype.click = nativeAnchorClick;
  URL.createObjectURL = nativeCreateObjectURL;
  URL.revokeObjectURL = nativeRevokeObjectURL;
});

function tableOf(text: string, fileName = 'lab.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`测试数据解析失败：${outcome.error.message}`);
  return outcome.table;
}

/** 与 ChartLab 相同的顺序将 CSV 推到「当前画面状态」，避免为测试另造一份假数据。 */
function liveState(
  csvText: string,
  options: {
    fileName?: string;
    kind?: ChartKind;
    xIndex: number | null;
    yIndex: number | null;
    aggregation?: CategoryAggregation;
    yStartMode?: 'auto' | 'manual';
    yStartRaw?: string;
  },
) {
  const table = tableOf(csvText, options.fileName ?? 'lab.csv');
  const kind = options.kind ?? 'bar';
  const aggregation: CategoryAggregation = kind === 'bar' ? (options.aggregation ?? 'raw') : 'raw';
  const base = defaultChartConfig();
  const config = {
    ...base,
    yAxisStart: { mode: options.yStartMode ?? 'auto', raw: options.yStartRaw ?? '' },
  } as typeof base;

  const columnTypes = analyzeColumnTypes(table);
  const xFieldLabel = options.xIndex !== null ? (columnTypes.columns[options.xIndex]?.label ?? '') : '';
  const yFieldLabel = options.yIndex !== null ? (columnTypes.columns[options.yIndex]?.label ?? '') : '';
  const titleDefaults = computeTitleDefaults(kind, { x: xFieldLabel, y: yFieldLabel }, aggregation);
  const snapshot: ChartConfigSnapshot = resolveChartTitles(config, titleDefaults);
  const result: ChartDataResult | null =
    options.xIndex !== null && options.yIndex !== null
      ? computeChartData(table, kind, options.xIndex, options.yIndex, aggregation)
      : null;
  const axisStart: ResolvedYAxisStart = resolveYAxisStart(config.yAxisStart, result ? result.yRange : null);
  const scope: ChartScopeSummary | null = result
    ? summarizeChartScope(result, { xLabel: xFieldLabel, yLabel: yFieldLabel, title: snapshot.title })
    : null;
  const diagnostic: BaselineDiagnostic | null = result
    ? diagnoseBaseline({ kind, yRange: result.yRange, axisStart, yFieldLabel })
    : null;
  const admission = evaluateQualityAdmission(table);
  const quality = admission.allowed ? analyzeDataQuality(table) : null;
  const chart = buildReportChartContext({
    kind,
    xIndex: options.xIndex,
    yIndex: options.yIndex,
    xFieldLabel,
    yFieldLabel,
    aggregation,
    snapshot,
    axisStart,
    result,
    scope,
    diagnostic,
  });
  const reportContext: ReportBuildContext = { table, admission, quality, chart, repair: null };
  return { table, kind, snapshot, axisStart, result, scope, diagnostic, chart, reportContext, aggregation };
}

const TREATMENT_CSV = ['group,value', '对照,7', '处理,9', '复测,8'].join('\n');

describe('chartExport：PNG 可用性判定只认真实画面状态', () => {
  it('准入通过 + 有 option + 有绘制单元：PNG 可用且不需要理由', () => {
    const availability = evaluateChartExport({
      admissionAllowed: true,
      optionReady: true,
      displayedCount: 3,
      selectionReady: true,
    });

    expect(availability.png).toEqual({ enabled: true, reason: '' });
    expect(availability.report.enabled).toBe(true);
  });

  it('准入被阻止：PNG 禁用并解释不导出可能被误读的图，报告仍可留证', () => {
    const availability = evaluateChartExport({
      admissionAllowed: false,
      optionReady: true,
      displayedCount: 3,
      selectionReady: true,
    });

    expect(availability.png.enabled).toBe(false);
    expect(availability.png.reason).toContain('数据质量准入未通过');
    expect(availability.report.enabled).toBe(true);
  });

  it('还没选定字段：提示先选字段，而不是说没有数据点', () => {
    const availability = evaluateChartExport({
      admissionAllowed: true,
      optionReady: false,
      displayedCount: 0,
      selectionReady: false,
    });

    expect(availability.png.enabled).toBe(false);
    expect(availability.png.reason).toContain('请先选择合法的 X ／ Y 字段');
  });

  it('字段合法但记录全被排除：说明没有可绘制数据点，并指向报告留证', () => {
    const availability = evaluateChartExport({
      admissionAllowed: true,
      optionReady: false,
      displayedCount: 0,
      selectionReady: true,
    });

    expect(availability.png.enabled).toBe(false);
    expect(availability.png.reason).toContain('当前选择下没有可绘制的数据点');
    expect(availability.png.reason).toContain('Markdown 报告仍会如实记录');
  });

  it('已有绘制单元却没生成 option（防御态）：仍按「还没有可导出的图表」提示', () => {
    const availability = evaluateChartExport({
      admissionAllowed: true,
      optionReady: false,
      displayedCount: 5,
      selectionReady: true,
    });

    expect(availability.png.reason).toContain('还没有可导出的图表');
  });

  it('报告按钮在四种 PNG 状态下都可点：报告记录的是过程，包括为什么不能下结论', () => {
    const states = [
      { admissionAllowed: true, optionReady: true, displayedCount: 3, selectionReady: true },
      { admissionAllowed: false, optionReady: false, displayedCount: 0, selectionReady: false },
      { admissionAllowed: true, optionReady: false, displayedCount: 0, selectionReady: true },
      { admissionAllowed: true, optionReady: true, displayedCount: 0, selectionReady: true },
    ];

    for (const state of states) {
      expect(evaluateChartExport(state).report).toEqual({ enabled: true, reason: '' });
    }
  });
});

describe('chartExport：导出对象说明与屏幕一致', () => {
  it('柱状图逐条记录：用「个数据点」并写明字段与聚合口径', () => {
    const caption = describeExportTarget({
      kind: 'bar',
      kindLabel: '柱状图',
      title: '各组实测值',
      xFieldLabel: 'group',
      yFieldLabel: 'value',
      aggregationLabel: '原始记录',
      displayedCount: 3,
      aggregated: false,
      capHidden: 0,
      admissionAllowed: true,
    });

    expect(caption).toContain('柱状图');
    expect(caption).toContain('《各组实测值》');
    expect(caption).toContain('X 轴「group」→ Y 轴「value」');
    expect(caption).toContain('原始记录');
    expect(caption).toContain('实际绘制 3 个数据点');
    expect(caption).not.toContain('受展示上限');
    expect(caption).not.toContain('PNG 已禁用');
  });

  it('按类别平均值：改用「根柱子」的单位，与屏幕口径同步', () => {
    const caption = describeExportTarget({
      kind: 'bar',
      kindLabel: '柱状图',
      title: '平均值',
      xFieldLabel: 'group',
      yFieldLabel: 'value',
      aggregationLabel: '按类别平均值',
      displayedCount: 2,
      aggregated: true,
      capHidden: 0,
      admissionAllowed: true,
    });

    expect(caption).toContain('按类别平均值');
    expect(caption).toContain('实际绘制 2 根柱子');
  });

  it('触顶隐藏的记录被点名：不会进 PNG，说明文字先讲清楚', () => {
    const caption = describeExportTarget({
      kind: 'scatter',
      kindLabel: '散点图',
      title: '剂量反应',
      xFieldLabel: 'dose',
      yFieldLabel: 'response',
      aggregationLabel: '原始记录',
      displayedCount: 100,
      aggregated: false,
      capHidden: 37,
      admissionAllowed: true,
    });

    expect(caption).toContain('另有 37 条有效记录受展示上限影响没有显示');
    expect(caption).toContain('同样不会出现在 PNG 里');
  });

  it('准入被阻止时说明文字直接写明 PNG 已禁用、报告为非正式结论', () => {
    const caption = describeExportTarget({
      kind: 'bar',
      kindLabel: '柱状图',
      title: '标题',
      xFieldLabel: 'a',
      yFieldLabel: 'b',
      aggregationLabel: '原始记录',
      displayedCount: 0,
      aggregated: false,
      capHidden: 0,
      admissionAllowed: false,
    });

    expect(caption).toContain('PNG 已禁用');
    expect(caption).toContain('非正式结论');
  });

  it('千位分隔与屏幕统计同口径：1,234 而不是 1234', () => {
    const caption = describeExportTarget({
      kind: 'line',
      kindLabel: '折线图',
      title: '趋势',
      xFieldLabel: 'date',
      yFieldLabel: 'value',
      aggregationLabel: '原始记录',
      displayedCount: 1234,
      aggregated: false,
      capHidden: 0,
      admissionAllowed: true,
    });

    expect(caption).toContain('实际绘制 1,234 个数据点');
  });
});

describe('chartExport：请求装配与两个导出入口', () => {
  it('buildPngRequest：文件名带来源片段与时间戳，option 与标题原样透传', () => {
    const option = { series: [{ type: 'bar', data: [7, 9, 8] }], yAxis: { min: 6 } };
    const context: PngExportContext = { option, title: '各组实测值', sourceFileName: 'treatment/对照 记录.csv' };
    const request = buildPngRequest(context, new Date(2026, 10, 19, 9, 5, 3));

    expect(request.fileName).toBe('figureguard-chart-对照_记录-20261119-090503.png');
    expect(request.option).toBe(option);
    expect(request.title).toBe('各组实测值');
    // 未显式指定尺寸时沿用导出模块常量（由 exportChartPng 内部兜底）。
    expect(request.width).toBeUndefined();
  });

  it('runPngExport：离屏实例收到当前 option 加导出专用配置，完成后销毁', async () => {
    const state = liveState(TREATMENT_CSV, { fileName: 'treatment.csv', xIndex: 0, yIndex: 1 });
    const option = { series: [{ type: 'bar', data: [7, 9, 8] }] };
    const context: PngExportContext = { option, title: state.snapshot.title, sourceFileName: state.table.fileName };

    const outcome = await runPngExport(context, new Date(2026, 10, 19, 9, 5, 3));

    expect(outcome.ok).toBe(true);
    expect(outcome.fileName).toMatch(/^figureguard-chart-treatment-\d{8}-\d{6}\.png$/);
    expect(echartsMock.instances).toHaveLength(1);
    const instance = echartsMock.instances[0]!;
    expect(instance.options[0]?.series).toEqual(option.series);
    expect(instance.options[0]?.animation).toBe(false);
    expect(instance.options[0]?.backgroundColor).toBe('#ffffff');
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(clickedAnchors[0]?.download).toBe(outcome.fileName);
    expect(document.querySelectorAll('[data-testid="chart-png-export-host"]')).toHaveLength(0);
  });

  it('runPngExport 可覆写尺寸与像素比：请求里带什么就按什么导出', async () => {
    const context: PngExportContext = {
      option: { series: [] },
      title: '标题',
      sourceFileName: 'lab.csv',
      width: PNG_EXPORT_WIDTH,
      height: PNG_EXPORT_HEIGHT,
      pixelRatio: PNG_PIXEL_RATIO,
    };

    const outcome = await runPngExport(context, new Date(2026, 10, 19, 9, 5, 3));

    expect(outcome.ok).toBe(true);
    expect(PNG_EXPORT_WIDTH * PNG_PIXEL_RATIO).toBe(1920);
  });

  it('buildReportFile：文件名 .md 带来源片段，正文按当前画面重新计算', () => {
    const state = liveState(TREATMENT_CSV, { fileName: 'treatment.csv', xIndex: 0, yIndex: 1 });
    const { markdown, fileName } = buildReportFile(state.reportContext, new Date(2026, 10, 19, 9, 5, 3));

    expect(fileName).toMatch(/^figureguard-report-treatment-\d{8}-\d{6}\.md$/);
    expect(markdown).toContain('# FigureGuard 数据与图表诊断报告');
    expect(markdown).toContain('treatment.csv');
    expect(markdown).toContain('2026-11-19 09:05:03');
    // 数值来自这份 CSV，而不是示例里写死的 A=96 / B=98。
    expect(markdown).toContain('| 4. 实际显示的数据单元 | 3 个观测点 |');
    expect(markdown).toContain('对照');
    expect(markdown).not.toContain('height_cm');
  });

  it('报告上下文装配：没有选定字段就没有图表上下文，报告不编造配置', () => {
    const state = liveState(TREATMENT_CSV, { fileName: 'treatment.csv', xIndex: null, yIndex: null });

    expect(state.chart).toBeNull();
    const { markdown } = buildReportFile(state.reportContext, new Date(2026, 10, 19, 9, 5, 3));
    expect(markdown).toContain('当前画面没有可导出的图表');
  });

  it('报告上下文装配：手动起点排除零基线时把 risk 诊断带进报告', () => {
    const state = liveState(TREATMENT_CSV, {
      fileName: 'treatment.csv',
      xIndex: 0,
      yIndex: 1,
      yStartMode: 'manual',
      yStartRaw: '6',
    });
    const chart = state.chart as ReportChartContext;

    expect(chart.axisStart.appliedMin).toBe(6);
    expect(chart.diagnostic?.status).toBe('risk');
    const { markdown } = buildReportFile(state.reportContext, new Date(2026, 10, 19, 9, 5, 3));
    expect(markdown).toContain('手动 6');
  });

  it('runReportExport：以 UTF-8 Markdown 触发本地下载并回显体积', () => {
    const state = liveState(TREATMENT_CSV, { fileName: 'treatment.csv', xIndex: 0, yIndex: 1 });
    const outcome = runReportExport(state.reportContext, new Date(2026, 10, 19, 9, 5, 3));

    expect(outcome.ok).toBe(true);
    expect(outcome.fileName).toMatch(/^figureguard-report-treatment-\d{8}-\d{6}\.md$/);
    if (outcome.ok) expect(outcome.byteLength).toBeGreaterThan(0);
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0]?.download).toBe(outcome.fileName);
  });

  it('准入被阻止时装配出的报告只留证：报告层闸门不因上下文里带着图表而失效', () => {
    const state = liveState(['group,value', 'A,96', 'B,98', 'C,97', 'D'].join('\n'), {
      fileName: 'broken.csv',
      xIndex: 0,
      yIndex: 1,
      yStartMode: 'manual',
      yStartRaw: '95',
    });

    expect(state.reportContext.admission.allowed).toBe(false);
    // 装配层照常能算出图表上下文与 risk 诊断：这正是调用层（ChartLab）必须自己挡住的输入。
    expect(state.chart).not.toBeNull();
    expect(state.chart?.result.validCount).toBe(3);
    expect(state.chart?.diagnostic?.status).toBe('risk');

    const { markdown } = buildReportFile(state.reportContext, new Date(2026, 10, 19, 9, 5, 3));
    expect(markdown).toContain('非正式结论');
    expect(markdown.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(7);
    expect(markdown).not.toContain('| 图表类型 |');
    expect(markdown).not.toContain('| 检查状态 |');
    expect(markdown).not.toContain('| 2. 满足当前 X ／ Y 条件的有效记录数 |');
    expect(markdown).not.toContain('状态码');
  });
});

describe('chartExport：准入被阻止时的说明文字与报告口径一致', () => {
  it('说明文字不再声称「当前画面上有正式图表」，也不复述绘图单元数', () => {
    const caption = describeExportTarget({
      kind: 'bar',
      kindLabel: '柱状图',
      title: '三组实测值',
      xFieldLabel: 'group',
      yFieldLabel: 'value',
      aggregationLabel: '原始记录',
      displayedCount: 3,
      aggregated: false,
      capHidden: 0,
      admissionAllowed: false,
    });

    expect(caption).toContain('屏幕上没有正式图表');
    expect(caption).toContain('PNG 已禁用');
    expect(caption).toContain('非正式结论');
    expect(caption).toContain('不提供正式数据统计、图表配置结论、风险诊断或修复结论');
    expect(caption).not.toContain('导出对象是当前画面上的这张柱状图');
    expect(caption).not.toContain('实际绘制 3 个数据点');
    expect(caption).not.toContain('《三组实测值》');
  });
});

describe('chartExport：错误文案与失败兜底', () => {
  it('errorText：Error 取 message，非 Error 转字符串', () => {
    expect(errorText(new Error('画布不可用'))).toBe('画布不可用');
    expect(errorText('浏览器拒绝下载')).toBe('浏览器拒绝下载');
    expect(errorText(undefined)).toBe('undefined');
  });

  it('getDataURL 返回空串：runPngExport 以中文说明失败且不落地文件', async () => {
    echartsMock.state.dataUrl = '';

    const outcome = await runPngExport(
      { option: { series: [] }, title: '标题', sourceFileName: 'lab.csv' },
      new Date(2026, 10, 19, 9, 5, 3),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('没有返回图像数据');
    expect(clickedAnchors).toHaveLength(0);
    expect(echartsMock.instances).toHaveLength(1);
    expect(echartsMock.instances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-testid="chart-png-export-host"]')).toHaveLength(0);
  });
});
