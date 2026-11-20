import { describe, expect, it } from 'vitest';

import { analyzeColumnTypes } from './columnTypes';
import { parseCsvText } from './csv';
import { analyzeDataQuality, evaluateQualityAdmission } from './dataQuality';
import { computeChartData, summarizeChartScope, toEChartsOption } from './chartData';
import {
  applyAutoBaselineConfig,
  createRepairRecord,
} from './chartRepair';
import type { ChartRepairRecord } from './chartRepair';
import { computeTitleDefaults, defaultChartConfig, resolveChartTitles, resolveYAxisStart } from './chartConfig';
import { diagnoseBaseline } from './chartDiagnostics';
import {
  ADMISSION_BLOCKED_SECTION_NOTE,
  REPORT_TITLE,
  buildMarkdownReport,
  buildReportFileName,
  escapeMarkdownText,
} from './reportExport';
import type { ReportChartContext, ReportInput } from './reportExport';
import type { ChartConfigSnapshot, ResolvedYAxisStart } from './chartConfig';
import type { CategoryAggregation, ChartConfig, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';
import type { BaselineDiagnostic } from './chartDiagnostics';

/**
 * 报告的每一条数字都必须来自真实计算，因此测试直接复用 Day 4～Day 8 的模块，
 * 按 ChartLab 相同的顺序把 CSV 推到「当前画面状态」，再交给 buildMarkdownReport。
 */

const PLANT_CSV = [
  'sample_id,date,group,height_cm',
  'PG-001,2026-03-02,control,12.4',
  'PG-002,2026-03-02,treated,15.1',
  'PG-003,2026-03-03,control,13.0',
  'PG-004,2026-03-03,treated,',
  'PG-005,2026-03-04,control,12.7',
  'PG-006,2026-03-04,treated,88.6',
  'PG-007,2026-03-05,control,',
  'PG-008,2026-03-05,treated,16.8',
  'PG-009,2026-03-06,control,13.5',
  'PG-010,2026-03-06,treated,-4.2',
  'PG-011,2026-03-07,control,14.1',
  'PG-012,2026-03-07,treated,15.9',
].join('\n');

const BASELINE_CSV = ['group,value', 'A,96', 'B,98', 'C,97'].join('\n');

const MIXED_CSV = [
  'city,temp_c,rain_mm',
  '北京,21,3',
  '上海,abc,5',
  '北京,23,',
  '广州,19,7',
  '北京,21,3',
].join('\n');

function tableOf(text: string, fileName = 'lab.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`测试数据解析失败：${outcome.error.message}`);
  return outcome.table;
}

interface ScenarioOptions {
  fileName?: string;
  kind?: ChartKind;
  xIndex: number | null;
  yIndex: number | null;
  aggregation?: CategoryAggregation;
  config?: ChartConfig;
  /** 先按 risk 配置生成修复记录，再把画面状态推进到修复之后（与 Day 8 屏幕一致）。 */
  applyRepair?: boolean;
}

interface Scenario {
  table: CsvTable;
  input: ReportInput;
  markdown: string;
  chart: ReportChartContext | null;
  snapshot: ChartConfigSnapshot;
  axisStart: ResolvedYAxisStart;
  diagnostic: BaselineDiagnostic | null;
  lines: string[];
}

function configWith(overrides: {
  title?: string;
  xTitle?: string;
  xUnit?: string;
  yTitle?: string;
  yUnit?: string;
  yStartMode?: 'auto' | 'manual';
  yStartRaw?: string;
} = {}): ChartConfig {
  const base = defaultChartConfig();
  return {
    ...base,
    title: overrides.title ?? '',
    titleEdited: overrides.title !== undefined,
    xAxis: {
      ...base.xAxis,
      title: overrides.xTitle ?? '',
      titleEdited: overrides.xTitle !== undefined,
      unit: overrides.xUnit ?? '',
    },
    yAxis: {
      ...base.yAxis,
      title: overrides.yTitle ?? '',
      titleEdited: overrides.yTitle !== undefined,
      unit: overrides.yUnit ?? '',
    },
    yAxisStart:
      overrides.yStartMode === undefined
        ? base.yAxisStart
        : { mode: overrides.yStartMode, raw: overrides.yStartRaw ?? '' },
  };
}

function chartState(table: CsvTable, options: Required<Pick<ScenarioOptions, 'kind' | 'xIndex' | 'yIndex' | 'aggregation'>> & { config: ChartConfig }) {
  const { kind, xIndex, yIndex, aggregation, config } = options;
  const columnTypes = analyzeColumnTypes(table);
  const xFieldLabel = xIndex !== null ? (columnTypes.columns[xIndex]?.label ?? '') : '';
  const yFieldLabel = yIndex !== null ? (columnTypes.columns[yIndex]?.label ?? '') : '';
  const effectiveAggregation: CategoryAggregation = kind === 'bar' ? aggregation : 'raw';
  const titleDefaults = computeTitleDefaults(kind, { x: xFieldLabel, y: yFieldLabel }, effectiveAggregation);
  const snapshot = resolveChartTitles(config, titleDefaults);
  const result =
    xIndex !== null && yIndex !== null ? computeChartData(table, kind, xIndex, yIndex, effectiveAggregation) : null;
  const axisStart = resolveYAxisStart(config.yAxisStart, result ? result.yRange : null);
  const scope = result ? summarizeChartScope(result, { xLabel: xFieldLabel, yLabel: yFieldLabel, title: snapshot.title }) : null;
  const diagnostic = result ? diagnoseBaseline({ kind, yRange: result.yRange, axisStart, yFieldLabel }) : null;
  const chart: ReportChartContext | null =
    result !== null && scope !== null && xIndex !== null && yIndex !== null
      ? {
          kind,
          xIndex,
          yIndex,
          xFieldLabel,
          yFieldLabel,
          aggregation: effectiveAggregation,
          snapshot,
          axisStart,
          result,
          scope,
          diagnostic,
        }
      : null;
  return { chart, snapshot, axisStart, diagnostic, titleDefaults, xFieldLabel, yFieldLabel, effectiveAggregation, config };
}

function scenario(csvText: string, options: ScenarioOptions): Scenario {
  const table = tableOf(csvText, options.fileName ?? 'lab.csv');
  const kind = options.kind ?? 'bar';
  const aggregation = options.aggregation ?? 'raw';
  const config = options.config ?? configWith();
  const admission = evaluateQualityAdmission(table);
  const quality = admission.allowed ? analyzeDataQuality(table) : null;
  const generatedAt = new Date(2026, 10, 19, 9, 5, 3);

  let repair: ChartRepairRecord | null = null;
  let liveConfig = config;
  if (options.applyRepair === true) {
    const before = chartState(table, { kind, xIndex: options.xIndex, yIndex: options.yIndex, aggregation, config });
    repair = createRepairRecord({
      table,
      admissionAllowed: admission.allowed,
      kind,
      xIndex: before.chart?.xIndex ?? 0,
      yIndex: before.chart?.yIndex ?? 0,
      aggregation: before.effectiveAggregation,
      config: before.config,
      result: before.chart?.result ?? null,
      diagnostic: before.diagnostic,
      xFieldLabel: before.xFieldLabel,
      yFieldLabel: before.yFieldLabel,
      titleDefaults: before.titleDefaults,
    });
    // 修复生效后屏幕上用的是自动起点：报告必须按「当前画面」而不是「修复前」描述配置。
    liveConfig = applyAutoBaselineConfig(config);
  }

  const state = chartState(table, { kind, xIndex: options.xIndex, yIndex: options.yIndex, aggregation, config: liveConfig });
  const input: ReportInput = { table, admission, quality, chart: state.chart, repair, generatedAt };
  const markdown = buildMarkdownReport(input);
  return {
    table,
    input,
    markdown,
    chart: state.chart,
    snapshot: state.snapshot,
    axisStart: state.axisStart,
    diagnostic: state.diagnostic,
    lines: markdown.split('\n'),
  };
}

/** 取「| 项目 | 内容 |」表里某一行的原文，用来断言真实数字确实写进了报告。 */
function row(markdown: string, label: string): string {
  const line = markdown.split('\n').find((candidate) => candidate.startsWith(`| ${label} |`));
  if (line === undefined) throw new Error(`报告里缺少这一行：${label}\n${markdown}`);
  return line;
}

function section(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) throw new Error(`报告里没有章节：${heading}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

const HEADINGS = [
  '## 1. 数据来源',
  '## 2. 数据质量摘要',
  '## 3. 当前图表配置',
  '## 4. 参与绘图与排除记录',
  '## 5. 图表表达风险诊断',
  '## 6. 图表修复记录',
  '## 7. 分析边界与说明',
];

describe('buildMarkdownReport：结构与真实计算来源', () => {
  it('B1 七个章节按顺序齐全，标题唯一', () => {
    const md = scenario(PLANT_CSV, { xIndex: 2, yIndex: 3, aggregation: 'mean' }).markdown;
    expect(md.startsWith(`# ${REPORT_TITLE}`)).toBe(true);
    const positions = HEADINGS.map((heading) => md.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('B2 质量数字与 analyzeDataQuality 完全一致，不另起口径', () => {
    const scene = scenario(PLANT_CSV, { xIndex: 2, yIndex: 3, aggregation: 'mean' });
    const quality = analyzeDataQuality(scene.table);
    expect(quality.missing.recordCount).toBe(12);
    expect(quality.missing.totalEmptyCells).toBe(2);
    expect(row(scene.markdown, '原始记录数 / 列数')).toContain('12');
    expect(row(scene.markdown, '原始记录数 / 列数')).toContain('4');
    expect(row(scene.markdown, '空字符串单元格（内容缺失）')).toContain(`${quality.missing.totalEmptyCells} 个`);
    expect(row(scene.markdown, '完全重复组数')).toContain(`${quality.duplicates.duplicateGroupCount} 组`);
    expect(row(scene.markdown, '整表单元格数')).toContain(`${quality.missing.cellCount} 个`);
  });

  it('B3 报告里没有写死的示例数据与固定结论：换成别的数据集就不出现别人的数字与字段', () => {
    const md = scenario('id,w\n甲,1\n乙,2\n丙,3', { xIndex: 0, yIndex: 1 }).markdown;
    expect(md).not.toContain('plant-growth');
    expect(md).not.toContain('height_cm');
    expect(md).not.toContain('96');
    expect(md).not.toContain('98');
    expect(md).not.toContain('95');
    expect(md).toContain('甲');
  });

  it('B4 参与与排除计数逐条取自 ChartDataResult', () => {
    const scene = scenario(MIXED_CSV, { xIndex: 0, yIndex: 1 });
    const result = scene.chart?.result;
    expect(result).not.toBeNull();
    expect(result?.invalidExcluded).toBe(1);
    expect(result?.missingExcluded).toBe(0);
    expect(row(scene.markdown, '1. 原始记录总数')).toContain(`${result?.rawTotal} 条`);
    expect(row(scene.markdown, '2. 满足当前 X ／ Y 条件的有效记录数')).toContain(`${result?.validCount} 条`);
    expect(row(scene.markdown, '3a. 因缺失值排除')).toContain(`${result?.missingExcluded} 条`);
    expect(row(scene.markdown, '3b. 因类型不符或非有限数值排除')).toContain(`${result?.invalidExcluded} 条`);
    expect(row(scene.markdown, '4. 实际显示的数据单元')).toContain(`${result?.displayedCount}`);
    expect(section(scene.markdown, '## 4. 参与绘图与排除记录')).toContain(scene.chart?.scope.headline ?? '');
  });

  it('B4b 缺失与无效两类排除分别计数，互不合并', () => {
    const missingScene = scenario(MIXED_CSV, { xIndex: 0, yIndex: 2 });
    expect(missingScene.chart?.result.missingExcluded).toBe(1);
    expect(missingScene.chart?.result.invalidExcluded).toBe(0);
    const missingSection = section(missingScene.markdown, '## 4. 参与绘图与排除记录');
    expect(missingSection).toContain('空字符串 1 条');
    expect(row(missingScene.markdown, '3a. 因缺失值排除')).toContain('1 条');
    expect(row(missingScene.markdown, '3b. 因类型不符或非有限数值排除')).toContain('0 条');
  });

  it('B5 触顶时明确说明未显示的记录没进图，也不进 PNG', () => {
    const rows = Array.from({ length: 120 }, (_, index) => `s${index},${index + 1}`).join('\n');
    const scene = scenario(`sample,value\n${rows}`, { xIndex: 0, yIndex: 1 });
    const result = scene.chart?.result;
    expect(result?.capHidden).toBe(20);
    expect(row(scene.markdown, '5. 有效但因展示上限未显示')).toContain('20');
    expect(section(scene.markdown, '## 7. 分析边界与说明')).toContain('未出现在 PNG 中');
  });

  it('B6 聚合结果超出可表示范围时如实标注，不当成无效数据', () => {
    const scene = scenario('grp,v\na,1e308\na,1e308\nb,1', { xIndex: 0, yIndex: 1, aggregation: 'sum' });
    expect(scene.chart?.result.overflowGroups.length).toBe(1);
    expect(section(scene.markdown, '## 3. 当前图表配置')).toContain('无法用有限数值表示');
    expect(row(scene.markdown, '6. 聚合结果无法有限表示、因此未成图的类别组')).toContain('1 组');
  });
});

describe('buildMarkdownReport：图表配置章节', () => {
  it('B7 标题、轴标题与用户单位全部来自当前快照', () => {
    const scene = scenario(PLANT_CSV, {
      xIndex: 2,
      yIndex: 3,
      aggregation: 'mean',
      config: configWith({ title: '处理组株高对比', xTitle: '处理', xUnit: '组', yTitle: '株高', yUnit: 'cm' }),
    });
    expect(row(scene.markdown, '图表标题')).toContain('处理组株高对比');
    expect(row(scene.markdown, 'X 轴单位')).toContain('组');
    expect(row(scene.markdown, 'Y 轴单位')).toContain('cm');
    expect(row(scene.markdown, 'Y 轴标注（轴标题 + 单位）')).toContain('株高');
  });

  it('B8 单位未填写就写「未填写」，绝不自动补 cm / kg', () => {
    const md = scenario(PLANT_CSV, { xIndex: 2, yIndex: 3, aggregation: 'mean' }).markdown;
    expect(row(md, 'Y 轴单位')).toContain('未填写');
    expect(row(md, 'Y 轴单位')).toContain('系统不猜测');
    expect(row(md, 'Y 轴单位')).not.toMatch(/cm|kg|毫米|米/);
  });

  it('B9 平均值口径逐组给出有效样本数 n 与原始行号', () => {
    const scene = scenario(PLANT_CSV, { xIndex: 2, yIndex: 3, aggregation: 'mean' });
    const chartSection = section(scene.markdown, '## 3. 当前图表配置');
    expect(chartSection).toContain('| 类别 | 有效样本数 n | 平均值 | 原始数据行号 |');
    expect(chartSection).toContain('control');
    expect(chartSection).toContain('treated');
    expect(chartSection).toMatch(/\| 「control」 \| 5 \|/u);
    expect(chartSection).toContain('平均值按组内有效样本数 n 计算');
    expect(chartSection).not.toContain('合计');
  });

  it('B10 求和只标注为用户选择的聚合方式，不宣称科学可加性', () => {
    const chartSection = section(scenario(MIXED_CSV, { xIndex: 0, yIndex: 1, aggregation: 'mean' }).markdown, '## 3. 当前图表配置');
    const sumSection = section(scenario(MIXED_CSV, { xIndex: 0, yIndex: 1, aggregation: 'sum' }).markdown, '## 3. 当前图表配置');
    expect(sumSection).toContain('求和是**用户选择的聚合方式**');
    expect(sumSection).toContain('不据此推断该指标具有科学可加性');
    expect(chartSection).not.toContain('科学可加性');
  });

  it('B11 折线图写明时间排序规则与真实时间范围', () => {
    const scene = scenario(PLANT_CSV, { kind: 'line', xIndex: 1, yIndex: 3 });
    const chartSection = section(scene.markdown, '## 3. 当前图表配置');
    expect(chartSection).toContain('时间排序规则');
    expect(chartSection).toContain('不平滑、不插值、不补测');
    expect(row(scene.markdown, 'X 轴时间范围（UTC）')).toContain('2026-03-02');
    expect(row(scene.markdown, 'X 轴时间范围（UTC）')).toContain('2026-03-07');
  });

  it('B12 散点图给出 X 数值范围，且不谎报聚合口径', () => {
    const scene = scenario(MIXED_CSV, { kind: 'scatter', xIndex: 2, yIndex: 1 });
    expect(row(scene.markdown, '分类聚合方式')).toContain('逐条原始记录');
    expect(row(scene.markdown, 'X 轴数值范围')).toContain('–');
    expect(row(scene.markdown, '纵轴起点')).toContain('不适用');
  });

  it('B13 手动纵轴下界写的是真正生效的值，自动范围不写成下界恰好为 0', () => {
    const manual = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1, config: configWith({ yStartMode: 'manual', yStartRaw: '95' }) });
    expect(row(manual.markdown, '纵轴起点')).toContain('手动 95');
    expect(row(manual.markdown, '纵轴起点')).toContain('yAxis.min');
    const auto = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1 });
    expect(row(auto.markdown, '纵轴起点')).toContain('自动范围');
    expect(row(auto.markdown, '纵轴起点')).not.toContain('恰好');
  });

  it('B14 无效的起点配置如实写「未生效」，不冒充已应用', () => {
    const scene = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1, config: configWith({ yStartMode: 'manual', yStartRaw: 'abc' }) });
    expect(row(scene.markdown, '纵轴起点')).toContain('手动设置未生效');
    expect(scene.axisStart.appliedMin).toBeNull();
  });
});

describe('buildMarkdownReport：诊断、修复与准入', () => {
  it('B15 非零基线风险按真实配置写出', () => {
    const scene = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1, config: configWith({ yStartMode: 'manual', yStartRaw: '95' }) });
    const diagSection = section(scene.markdown, '## 5. 图表表达风险诊断');
    expect(scene.diagnostic?.status).toBe('risk');
    expect(diagSection).toContain('bar-zero-baseline');
    expect(diagSection).toContain('95');
    expect(diagSection).toContain('不包含 0');
  });

  it('B16 未发现风险只说这条规则没发现问题，不等于图表全对', () => {
    const scene = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1 });
    const diagSection = section(scene.markdown, '## 5. 图表表达风险诊断');
    expect(scene.diagnostic?.status).toBe('clear');
    expect(diagSection).toContain('不能据此认为图表或科研结论正确');
    expect(diagSection).toContain('图例、误差棒、样本量、异常值');
  });

  it('B17 散点图与折线图记为不适用，不写成所有检查通过', () => {
    for (const kind of ['scatter', 'line'] as const) {
      const scene = scenario(PLANT_CSV, { kind, xIndex: kind === 'line' ? 1 : 3, yIndex: 3 });
      const diagSection = section(scene.markdown, '## 5. 图表表达风险诊断');
      expect(scene.diagnostic?.status).toBe('not-applicable');
      expect(diagSection).toContain('不适用');
      expect(diagSection).toContain('不是「所有风险检查通过」');
      expect(diagSection).not.toContain('所有检查通过。');
    }
  });

  it('B18 没有图表时不编造配置与结论', () => {
    const scene = scenario(PLANT_CSV, { xIndex: null, yIndex: null });
    expect(scene.chart).toBeNull();
    expect(scene.markdown).toContain('当前画面没有可导出的图表');
    expect(scene.markdown).toContain('没有参与绘图的记录可报告');
    expect(scene.markdown).toContain('未产出任何风险结论');
    expect(section(scene.markdown, '## 4. 参与绘图与排除记录')).toContain('没有参与绘图的记录可报告');
    expect(section(scene.markdown, '## 3. 当前图表配置')).not.toContain('图表标题');
  });

  it('B19 有效修复记录写出前后差异，并说明自动范围不等于下界恰好为 0', () => {
    const scene = scenario(BASELINE_CSV, {
      xIndex: 0,
      yIndex: 1,
      config: configWith({ yStartMode: 'manual', yStartRaw: '95' }),
      applyRepair: true,
    });
    expect(scene.input.repair).not.toBeNull();
    const repairSection = section(scene.markdown, '## 6. 图表修复记录');
    expect(repairSection).toContain('一键恢复零基线');
    expect(repairSection).toContain('restore-auto-zero-baseline');
    expect(repairSection).toContain('修复前真实纵轴下界');
    expect(repairSection).toContain('95');
    expect(repairSection).toContain('Y 轴起点');
    expect(repairSection).toContain('自动范围');
    expect(repairSection).toContain('不等于实际刻度下界恰好等于 0');
    // 修复后画面是自动范围：配置章节不能还写着手动 95
    expect(row(scene.markdown, '纵轴起点')).toContain('自动范围');
  });

  it('B20 撤销或失效后（repair 为 null）不再声称修复过', () => {
    const scene = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1 });
    expect(scene.input.repair).toBeNull();
    const repairSection = section(scene.markdown, '## 6. 图表修复记录');
    expect(repairSection).toContain('当前没有生效的修复记录');
    expect(repairSection).not.toContain('修复前真实纵轴下界');
  });

  it('B21 准入未通过时只出非正式结论，不给质量统计', () => {
    const scene = scenario('a,b,c\n1,2\n3,4,5', { xIndex: 0, yIndex: 1 });
    expect(scene.input.admission.allowed).toBe(false);
    expect(scene.input.quality).toBeNull();
    expect(scene.markdown).toContain('非正式结论');
    expect(scene.markdown).toContain('本次**未输出**数据质量统计');
    expect(section(scene.markdown, '## 2. 数据质量摘要')).not.toContain('2.1 字段类型推断');
    expect(section(scene.markdown, '## 1. 数据来源')).toContain('行列结构降级');
    expect(section(scene.markdown, '## 1. 数据来源')).toContain('阻止正式结论的原因');
  });

  it('B22 只读：生成报告不改动任何原始数据', () => {
    const scene = scenario(MIXED_CSV, { xIndex: 0, yIndex: 1 });
    const rowsRef = scene.table.rows;
    const rowsSnapshot = JSON.stringify(rowsRef);
    buildMarkdownReport(scene.input);
    expect(scene.table.rows).toBe(rowsRef);
    expect(JSON.stringify(scene.table.rows)).toBe(rowsSnapshot);
    expect(scene.table.columns).toHaveLength(3);
  });

  it('B23 每次调用按当前状态重新生成：改配置后报告随之改变', () => {
    const before = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1, config: configWith({ title: '修改前的标题' }) });
    const after = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1, config: configWith({ title: '修改后的标题' }) });
    expect(before.markdown).toContain('修改前的标题');
    expect(before.markdown).not.toContain('修改后的标题');
    expect(after.markdown).toContain('修改后的标题');
    expect(before.markdown).not.toBe(after.markdown);
  });
});

describe('escapeMarkdownText 与文件名', () => {
  it('B24 转义 Markdown 结构字符，控制字符压成空格', () => {
    expect(escapeMarkdownText('# 标题')).toBe('\\# 标题');
    expect(escapeMarkdownText('a|b')).toBe('a\\|b');
    expect(escapeMarkdownText('`code`')).toBe('\\`code\\`');
    expect(escapeMarkdownText('<script>alert(1)</script>')).toContain('\\<script\\>');
    expect(escapeMarkdownText('&amp;')).toBe('\\&amp;');
    expect(escapeMarkdownText('[链接](http://x)')).toBe('\\[链接\\]\\(http://x\\)');
    expect(escapeMarkdownText('第一行\n第二行')).toBe('第一行 第二行');
    expect(escapeMarkdownText('a\tb')).toBe('a b');
    expect(escapeMarkdownText('**粗体** _下划线_')).toBe('\\*\\*粗体\\*\\* \\_下划线\\_');
  });

  it('B25 恶意表头与多行单元格不会在报告里新造标题或表格行', () => {
    const evilCsv = ['# 注入|`<b>`,value', '"第一行\n第二行",1', '|管道|,2', '`反引号`,3'].join('\n');
    const scene = scenario(evilCsv, { fileName: 'evil.csv', xIndex: 0, yIndex: 1 });
    const md = scene.markdown;
    expect(md.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(7);
    expect(md.split('\n').filter((line) => /^# (?!FigureGuard)/.test(line))).toHaveLength(0);
    expect(md).toContain('\\# 注入');
    expect(md).toContain('\\<b\\>');
    expect(md).toContain('第一行 第二行');
    expect(md).not.toContain('\n第二行');
    // 表格行的竖线全部来自报告自身的结构：单元格里的 | 一律被转义
    expect(md).toContain('\\|管道\\|');
    expect(scene.table.rows[0]?.[0]).toContain('\n');
  });

  it('B26 报告文件名带来源片段与时间戳，后缀 .md', () => {
    const table = tableOf(PLANT_CSV, '实验数据.csv');
    expect(buildReportFileName(table, new Date(2026, 10, 19, 9, 5, 3))).toBe('figureguard-report-实验数据-20261119-090503.md');
    expect(buildReportFileName(tableOf(PLANT_CSV, '../../../etc/passwd'), new Date(2026, 10, 19, 9, 5, 3))).toBe(
      'figureguard-report-passwd-20261119-090503.md',
    );
  });

  it('B27 输出为 LF 换行、UTF-8 文本且末尾单个换行', () => {
    const md = scenario(PLANT_CSV, { xIndex: 2, yIndex: 3, aggregation: 'mean' }).markdown;
    expect(md).not.toContain('\r');
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
    expect(new TextEncoder().encode(md).length).toBeGreaterThan(md.length);
  });

  it('B28 报告与 PNG 用的是同一份绘图结果：数值、轴范围与屏幕 option 一致', () => {
    const scene = scenario(BASELINE_CSV, { xIndex: 0, yIndex: 1, config: configWith({ yStartMode: 'manual', yStartRaw: '95' }) });
    const result = scene.chart?.result;
    expect(result).toBeDefined();
    const option = toEChartsOption(result!, {
      xLabel: 'group',
      yLabel: 'value',
      xName: scene.snapshot.xAxisLabel,
      yName: scene.snapshot.yAxisLabel,
      yMin: scene.axisStart.appliedMin ?? undefined,
    });
    const series = (option.series as Array<Record<string, unknown>>)[0];
    const yAxis = option.yAxis as Record<string, unknown>;
    expect(series.data).toEqual([96, 98, 97]);
    expect(yAxis.min).toBe(95);
    expect(row(scene.markdown, '进入图表的 Y 数值范围')).toContain('96 – 98');
    expect(row(scene.markdown, '纵轴起点')).toContain(String(yAxis.min));
  });
});

// ===== Day 9 最终整改：质量准入失败时的报告隔离 =====

/** 结构性缺列：准入未通过，但字段类型仍可推断、仍有 3 条有效数值记录（用户复现的那份 CSV）。 */
const MISSING_COLUMN_CSV = ['group,value', 'A,96', 'B,98', 'C,97', 'D'].join('\n');
/** 引号未闭合：行列结构仍是 sound，只靠解析错误阻止准入。 */
const UNCLOSED_QUOTE_CSV = ['group,value', 'A,96', 'B,98', 'C,"97'].join('\n');

/** 正式结论在报告里一律以「| 项目 | 内容 |」表出现：这些行标签在留证报告里一行都不许出现。 */
const FORMAL_REPORT_ROWS = [
  '原始记录数 / 列数',
  '空字符串单元格（内容缺失）',
  '结构性缺列',
  '存在内容不完整的字段',
  '完全重复组数',
  '字段类型冲突候选',
  '图表类型',
  'X 轴字段',
  'Y 轴字段',
  '图表标题',
  '分类聚合方式',
  '纵轴起点',
  '进入图表的 Y 数值范围',
  '1. 原始记录总数',
  '2. 满足当前 X ／ Y 条件的有效记录数',
  '4. 实际显示的数据单元',
  '规则 ID',
  '检查状态',
  '风险级别',
  '参与判断的 Y 轴数值范围',
];

/** 修复记录专属的正式结论行：只有准入通过且有生效修复时才出现。 */
const REPAIR_REPORT_ROWS = ['本次修复操作', '修复前真实纵轴下界'];

function hasRow(markdown: string, label: string): boolean {
  return markdown.split('\n').some((line) => line.startsWith(`| ${label} |`));
}

/** 第 2 至第 6 节的正文：正式数值只可能出现在这里，第 1 节的解析事实（文件大小等）不参与泄漏断言。 */
function formalSections(markdown: string): string {
  return HEADINGS.slice(1, 6)
    .map((heading) => section(markdown, heading))
    .join('\n');
}

/** 留证报告的通用底线：七章节还在，但没有任何正式结论行、明细小标题或诊断状态码。 */
function expectNoFormalOutput(markdown: string): void {
  for (const heading of HEADINGS) expect(markdown).toContain(heading);
  for (const label of [...FORMAL_REPORT_ROWS, ...REPAIR_REPORT_ROWS]) {
    expect(hasRow(markdown, label), `准入未通过时不应出现正式结论行：${label}\n${markdown}`).toBe(false);
  }
  expect(markdown).not.toContain('### 2.1 字段类型推断');
  expect(markdown).not.toContain('### 2.2 质量规则发现的问题摘要');
  expect(markdown).not.toContain('### 3.1 数据处理与展示口径');
  expect(markdown).not.toContain('分组摘要');
  expect(markdown).not.toContain('状态码');
}

describe('buildMarkdownReport：质量准入失败时的报告隔离', () => {
  it('R1 结构缺列的 CSV：准入未通过且仍有 3 条有效记录，报告不得输出图表分析结论', () => {
    const scene = scenario(MISSING_COLUMN_CSV, {
      xIndex: 0,
      yIndex: 1,
      config: configWith({ yStartMode: 'manual', yStartRaw: '95' }),
    });
    expect(scene.input.admission.allowed).toBe(false);
    expect(scene.input.admission.structureState).toBe('degraded');
    // 字段类型可推断、绘图结果与诊断都非空：这些正是过去会漏进报告的内容。
    expect(scene.chart).not.toBeNull();
    expect(scene.chart?.result.validCount).toBe(3);
    expect(scene.diagnostic?.status).toBe('risk');

    expectNoFormalOutput(scene.markdown);
    const formal = formalSections(scene.markdown);
    expect(formal).not.toContain('96');
    expect(formal).not.toContain('98');
    expect(formal).not.toContain('95');
    expect(formal).not.toContain('bar-zero-baseline');
  });

  it('R2 引号未闭合但结构未降级：解析错误单独一条也足以阻止正式结论', () => {
    const scene = scenario(UNCLOSED_QUOTE_CSV, { xIndex: 0, yIndex: 1 });
    expect(scene.table.structure.state).toBe('sound');
    expect(scene.input.admission.structureState).toBe('sound');
    expect(scene.input.admission.parseErrorCount).toBe(1);
    expect(scene.input.admission.allowed).toBe(false);
    expect(scene.input.admission.blockers.map((blocker) => blocker.code)).toEqual(['parse-errors']);
    expect(scene.chart?.result.validCount).toBe(3);

    expectNoFormalOutput(scene.markdown);
    expect(section(scene.markdown, '## 1. 数据来源')).toContain('行列结构与表头一致（sound）');
    expect(section(scene.markdown, '## 1. 数据来源')).toContain('引号未闭合（MissingQuotes）：1 条');
    expect(formalSections(scene.markdown)).not.toContain('96');
  });

  it('R3 调用方硬塞非空 quality / chart / repair 也绕不过准入闸门', () => {
    // 先取一份真实修复记录（准入通过的演示数据），再把它塞给准入失败的那份数据。
    const donor = scenario(BASELINE_CSV, {
      xIndex: 0,
      yIndex: 1,
      config: configWith({ yStartMode: 'manual', yStartRaw: '95' }),
      applyRepair: true,
    });
    expect(donor.input.repair).not.toBeNull();
    expect(row(donor.markdown, '修复前真实纵轴下界')).toContain('95');

    const blocked = scenario(MISSING_COLUMN_CSV, {
      xIndex: 0,
      yIndex: 1,
      config: configWith({ yStartMode: 'manual', yStartRaw: '95' }),
    });
    const forced: ReportInput = {
      ...blocked.input,
      quality: analyzeDataQuality(blocked.table),
      repair: donor.input.repair,
    };
    expect(forced.admission.allowed).toBe(false);
    expect(forced.quality).not.toBeNull();
    expect(forced.chart).not.toBeNull();
    expect(forced.repair).not.toBeNull();

    const markdown = buildMarkdownReport(forced);
    expectNoFormalOutput(markdown);
    // 修复记录与统计数字都不许借道出现（差异表头、差异行标签与真实下界数值都不在）。
    expect(markdown).not.toContain('一键恢复零基线');
    expect(markdown).not.toContain('restore-auto-zero-baseline');
    expect(markdown).not.toContain('| 项目 | 修复前 | 修复后 |');
    expect(markdown).not.toContain('Y 轴起点');
    expect(formalSections(markdown)).not.toContain('95');
  });

  it('R4 七章节结构保留，第 2 至第 6 节逐节写明未执行且不能被读成检查通过', () => {
    const markdown = scenario(MISSING_COLUMN_CSV, { xIndex: 0, yIndex: 1 }).markdown;
    expect(markdown.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(HEADINGS.length);
    expect(markdown).toContain('本数据集未通过质量准入');
    expect(markdown).toContain('不提供正式数据统计、图表诊断或修复结论');
    for (const heading of HEADINGS.slice(1, 6)) {
      const body = section(markdown, heading);
      expect(body, `该章节应说明未执行：${heading}`).toContain('未执行');
      expect(body, `该章节应说明正式结果未输出：${heading}`).toContain('未输出');
      expect(body, `该章节应堵住「未执行 = 通过」的误读：${heading}`).toContain(ADMISSION_BLOCKED_SECTION_NOTE);
    }
    const boundary = section(markdown, '## 7. 分析边界与说明');
    expect(boundary).toContain('本次质量准入未通过');
    expect(boundary).toContain('未执行不等于通过检查');
    expect(boundary).toContain('不提供 PNG 导出');
    expect(boundary).not.toContain('与本报告配套的 PNG 图表需作为单独附件一同归档');
  });

  it('R5 准入通过的普通 CSV 仍输出完整七章节正式报告（不被整改误伤）', () => {
    const scene = scenario(BASELINE_CSV, {
      xIndex: 0,
      yIndex: 1,
      config: configWith({ yStartMode: 'manual', yStartRaw: '95' }),
    });
    expect(scene.input.admission.allowed).toBe(true);
    const markdown = scene.markdown;
    expect(markdown.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(HEADINGS.length);
    expect(markdown).toContain('本报告由 FigureGuard 在浏览器本地根据');
    expect(markdown).not.toContain('非正式结论');
    expect(markdown).not.toContain(ADMISSION_BLOCKED_SECTION_NOTE);
    for (const label of FORMAL_REPORT_ROWS) expect(hasRow(markdown, label)).toBe(true);
    // 没有执行过修复：修复行不出现，但第 6 节仍如实说明「当前没有生效的修复记录」。
    for (const label of REPAIR_REPORT_ROWS) expect(hasRow(markdown, label)).toBe(false);
    expect(section(markdown, '## 6. 图表修复记录')).toContain('当前没有生效的修复记录');
    expect(section(markdown, '## 5. 图表表达风险诊断')).toContain('状态码 risk');
    expect(section(markdown, '## 7. 分析边界与说明')).toContain('与本报告配套的 PNG 图表需作为单独附件一同归档');
  });

  it('R6 留证报告仍不含原始数据行，且逐字重复生成结果稳定', () => {
    const scene = scenario(MISSING_COLUMN_CSV, { xIndex: 0, yIndex: 1 });
    expect(scene.markdown).not.toContain('| A | 96 |');
    expect(buildMarkdownReport(scene.input)).toBe(scene.markdown);
  });
});
