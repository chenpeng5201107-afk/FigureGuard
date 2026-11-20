import { describe, expect, it } from 'vitest';

import { computeChartData, toEChartsOption } from './chartData';
import type { ChartAxisMeta } from './chartData';
import { computeTitleDefaults, defaultChartConfig, resolveYAxisStart } from './chartConfig';
import { diagnoseBaseline } from './chartDiagnostics';
import { parseCsvText } from './csv';
import {
  REPAIR_ACTION,
  applyAutoBaselineConfig,
  createRepairRecord,
  describeRepairChanges,
  describeRepairComparison,
  describeRepairStaleness,
  diffYAxisStart,
  evaluateRepairEligibility,
  evaluateRepairUndo,
  sameChartConfig,
} from './chartRepair';
import type { ChartRepairRecord, ChartRepairSource } from './chartRepair';
import type { CategoryAggregation, ChartConfig, ChartKind } from '../types/chart';
import type { CsvTable } from '../types/csv';

const BASELINE_CSV = ['group,value', 'A,96', 'B,98', 'C,97'].join('\n');
const NEG_MIX_CSV = ['group,value', 'A,-5', 'B,20', 'C,10'].join('\n');
const MULTINUM_CSV = ['grp,a,b,c', 'p,1,10,100', 'q,2,20,200', 'r,3,30,300'].join('\n');
const AGG_CSV = ['group,value', 'A,96', 'A,96', 'B,98', 'B,98'].join('\n');

interface OptionParts {
  yAxis: Record<string, unknown>;
  xAxis: { data: unknown[] };
  series: Array<{ data: unknown[] }>;
}

function tableOf(text: string, fileName = 'lab.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`测试数据解析失败：${outcome.error.message}`);
  return outcome.table;
}

/** 只读取 option 的结构，断言落在真实写进 ECharts 的配置上。 */
function parts(option: Record<string, unknown>): OptionParts {
  return option as unknown as OptionParts;
}
/** 真实调用 option 里的 tooltip.formatter，证明两张图悬浮的是同一批数据行。 */
function tooltipText(option: Record<string, unknown>, dataIndex: number): string {
  const formatter = (option as { tooltip?: { formatter?: (params: unknown) => string } }).tooltip?.formatter;
  return typeof formatter === 'function' ? formatter({ dataIndex }) : '';
}
function beforeData(record: ChartRepairRecord): unknown[] {
  return parts(record.beforeOption).series[0].data;
}
function afterData(record: ChartRepairRecord): unknown[] {
  return parts(record.afterOption).series[0].data;
}

interface SourceOptions {
  fileName?: string;
  mode?: 'auto' | 'manual';
  raw?: string;
  kind?: ChartKind;
  xIndex?: number;
  yIndex?: number;
  aggregation?: CategoryAggregation;
  admissionAllowed?: boolean;
  configPatch?: Partial<ChartConfig>;
}

/**
 * 走与界面完全相同的链路：CSV → computeChartData → resolveYAxisStart → diagnoseBaseline → 修复输入。
 * risk / clear 等状态一律由真实计算得出，测试里不手工构造诊断，以免把「不是硬编码」写成硬编码。
 */
function sourceOf(text: string, options: SourceOptions = {}): ChartRepairSource {
  const table = tableOf(text, options.fileName ?? 'lab.csv');
  const kind: ChartKind = options.kind ?? 'bar';
  const xIndex = options.xIndex ?? 0;
  const yIndex = options.yIndex ?? 1;
  const effectiveAggregation: CategoryAggregation = kind === 'bar' ? (options.aggregation ?? 'raw') : 'raw';
  const config: ChartConfig = {
    ...defaultChartConfig(),
    ...options.configPatch,
    yAxisStart: { mode: options.mode ?? 'manual', raw: options.raw ?? '95' },
  };
  const result = computeChartData(table, kind, xIndex, yIndex, effectiveAggregation);
  const xFieldLabel = table.columns[xIndex] ?? '';
  const yFieldLabel = table.columns[yIndex] ?? '';
  const resolvedStart = resolveYAxisStart(config.yAxisStart, result.yRange);
  const diagnostic = diagnoseBaseline({ kind, yRange: result.yRange, axisStart: resolvedStart, yFieldLabel });
  return {
    table,
    admissionAllowed: options.admissionAllowed ?? true,
    kind,
    xIndex,
    yIndex,
    aggregation: effectiveAggregation,
    config,
    result,
    diagnostic,
    xFieldLabel,
    yFieldLabel,
    titleDefaults: computeTitleDefaults(kind, { x: xFieldLabel, y: yFieldLabel }, effectiveAggregation),
  };
}

type WorkbenchPatch = Partial<{ table: CsvTable; kind: ChartKind; xIndex: number | null; yIndex: number | null; aggregation: CategoryAggregation }>;

function workbenchOf(source: ChartRepairSource, patch: WorkbenchPatch = {}) {
  return {
    table: patch.table ?? source.table,
    kind: patch.kind ?? source.kind,
    xIndex: 'xIndex' in patch ? patch.xIndex ?? null : source.xIndex,
    yIndex: 'yIndex' in patch ? patch.yIndex ?? null : source.yIndex,
    aggregation: patch.aggregation ?? source.aggregation,
  };
}

describe('evaluateRepairEligibility：六个触发条件缺一不可', () => {
  it('A=96、B=98、C=97 且起点 95：判定可修复，依据里带上真实下界', () => {
    const eligibility = evaluateRepairEligibility(sourceOf(BASELINE_CSV));
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reason).toContain('95');
  });

  it('自动模式不可修复：本条规则没有风险可修', () => {
    const eligibility = evaluateRepairEligibility(sourceOf(BASELINE_CSV, { mode: 'auto' }));
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('已经包含零基线');
  });

  it('手动起点 0（数据全为正）诊断为 clear，不允许修复', () => {
    const source = sourceOf(BASELINE_CSV, { raw: '0' });
    expect(source.diagnostic?.status).toBe('clear');
    expect(evaluateRepairEligibility(source).eligible).toBe(false);
  });

  it('起点 97 会把 96 裁到轴外：配置无效、并未生效，禁止修复', () => {
    const source = sourceOf(BASELINE_CSV, { raw: '97' });
    const eligibility = evaluateRepairEligibility(source);
    expect(source.diagnostic?.status).toBe('invalid-config');
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('不会为没有生效的配置伪造修复结果');
  });

  it('输入框里有正数不等于起点生效：abc / 留空 / 99 都不可修复', () => {
    for (const raw of ['abc', '', '99']) {
      const source = sourceOf(BASELINE_CSV, { raw });
      expect(source.diagnostic?.axisStart.appliedMin).toBeNull();
      expect(evaluateRepairEligibility(source).eligible).toBe(false);
    }
  });

  it('没有可绘制数值（Y 全为空）→ no-data，不产出虚假可修复状态', () => {
    const source = sourceOf(['group,value', 'A,', 'B,', 'C,'].join('\n'));
    expect(source.diagnostic?.status).toBe('no-data');
    const eligibility = evaluateRepairEligibility(source);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('没有可绘制的有限数值');
  });

  it('散点图不适用本条规则，不允许修复', () => {
    const source = sourceOf(MULTINUM_CSV, { kind: 'scatter', xIndex: 1, yIndex: 2, raw: '1' });
    expect(source.diagnostic?.status).toBe('not-applicable');
    expect(evaluateRepairEligibility(source).eligible).toBe(false);
  });

  it('数据质量准入未通过时不允许修复', () => {
    const eligibility = evaluateRepairEligibility(sourceOf(BASELINE_CSV, { admissionAllowed: false }));
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('数据质量准入未通过');
  });

  it('含负值的数据永远不会进入可修复状态：正向起点会被裁剪保护拦下', () => {
    for (const raw of ['1', '5', '95', '-1']) {
      expect(evaluateRepairEligibility(sourceOf(NEG_MIX_CSV, { raw })).eligible).toBe(false);
    }
  });

  it('图表还没生成（result / diagnostic 为 null）时说明没有可检查的图表', () => {
    const source: ChartRepairSource = { ...sourceOf(BASELINE_CSV), result: null, diagnostic: null };
    const eligibility = evaluateRepairEligibility(source);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('还没有生成可检查的图表');
  });
});

describe('createRepairRecord：真实修复动作与前后快照', () => {
  it('生成记录：修复前保留手动 95，修复后配置为自动模式', () => {
    const record = createRepairRecord(sourceOf(BASELINE_CSV));
    expect(record).not.toBeNull();
    expect(record?.ruleId).toBe('bar-zero-baseline');
    expect(record?.action).toBe(REPAIR_ACTION);
    expect(record?.beforeConfig.yAxisStart).toEqual({ mode: 'manual', raw: '95' });
    expect(record?.afterConfig.yAxisStart).toEqual({ mode: 'auto', raw: '' });
    expect(record?.afterAxisStart).toEqual({ mode: 'auto', appliedMin: null });
  });

  it('记录的是真正生效的数值下界，而不是输入框里的文本', () => {
    const record = createRepairRecord(sourceOf(BASELINE_CSV, { raw: ' 95.0 ' }));
    expect(record?.beforeAppliedMin).toBe(95);
    expect(record?.beforeAxisStart).toEqual({ mode: 'manual', appliedMin: 95 });
    expect(parts(record!.beforeOption).yAxis.min).toBe(95);
  });

  it('修复后的真实 option 不再携带旧的 yAxis.min=95，修复前那一份仍保留 95', () => {
    const record = createRepairRecord(sourceOf(BASELINE_CSV))!;
    expect(parts(record.beforeOption).yAxis.min).toBe(95);
    expect('min' in parts(record.afterOption).yAxis).toBe(false);
    expect(parts(record.afterOption).yAxis.scale).toBe(false);
  });

  it('把修复后的配置重新解析并诊断，结论为 clear（诊断不是硬编码）', () => {
    const record = createRepairRecord(sourceOf(BASELINE_CSV))!;
    const resolved = resolveYAxisStart(record.afterConfig.yAxisStart, record.result.yRange);
    const recheck = diagnoseBaseline({
      kind: record.kind,
      yRange: record.result.yRange,
      axisStart: resolved,
      yFieldLabel: record.yFieldLabel,
    });
    expect(recheck.status).toBe('clear');
    expect(recheck.axisStart.appliedMin).toBeNull();
    expect(recheck.summary).toContain('包含 0');
  });

  it('修复不改 CSV 数据：原始行、记录数与前后绘图数值逐条一致', () => {
    const source = sourceOf(BASELINE_CSV);
    const rowsBefore = JSON.stringify(source.table.rows);
    const record = createRepairRecord(source)!;
    expect(JSON.stringify(source.table.rows)).toBe(rowsBefore);
    expect(record.result.points.map((point) => point.yValue)).toEqual([96, 98, 97]);
    expect(beforeData(record)).toEqual([96, 98, 97]);
    expect(afterData(record)).toEqual([96, 98, 97]);
    expect(record.context.recordCount).toBe(source.table.recordCount);
  });

  it('前后两张图共用同一份数据结果，不生成第二份模拟数据', () => {
    const record = createRepairRecord(sourceOf(BASELINE_CSV))!;
    expect(parts(record.beforeOption).xAxis.data).toEqual(['A', 'B', 'C']);
    expect(parts(record.afterOption).xAxis.data).toEqual(parts(record.beforeOption).xAxis.data);
    expect(beforeData(record)).toEqual(afterData(record));
    expect(tooltipText(record.beforeOption, 0)).toBe(tooltipText(record.afterOption, 0));
    expect(tooltipText(record.afterOption, 0)).toContain('96');
    expect(record.beforeOption).not.toBe(record.afterOption);
  });

  it('已包含零基线时不生成记录；用修复后的配置再走一次也拿不到第二份记录', () => {
    expect(createRepairRecord(sourceOf(BASELINE_CSV, { mode: 'auto' }))).toBeNull();
    const source = sourceOf(BASELINE_CSV);
    const first = createRepairRecord(source)!;
    const resolved = resolveYAxisStart(first.afterConfig.yAxisStart, first.result.yRange);
    const afterSource: ChartRepairSource = {
      ...source,
      config: first.afterConfig,
      diagnostic: diagnoseBaseline({ kind: 'bar', yRange: first.result.yRange, axisStart: resolved, yFieldLabel: source.yFieldLabel }),
    };
    expect(createRepairRecord(afterSource)).toBeNull();
  });

  it('invalid-config / no-data / not-applicable 都不生成记录', () => {
    expect(createRepairRecord(sourceOf(BASELINE_CSV, { raw: '97' }))).toBeNull();
    expect(createRepairRecord(sourceOf(['group,value', 'A,', 'B,'].join('\n')))).toBeNull();
    expect(createRepairRecord(sourceOf(MULTINUM_CSV, { kind: 'scatter', xIndex: 1, yIndex: 2, raw: '1' }))).toBeNull();
  });

  it('修复目标（自动范围）对含负值的数据不裁剪：不带 min 且全部数值仍在', () => {
    const source = sourceOf(NEG_MIX_CSV, { mode: 'auto' });
    const meta: ChartAxisMeta = { xLabel: source.xFieldLabel, yLabel: source.yFieldLabel };
    const option = parts(toEChartsOption(source.result!, meta));
    expect('min' in option.yAxis).toBe(false);
    expect(option.series[0].data).toEqual([-5, 20, 10]);
  });

  it('聚合柱状图按真实聚合结果修复：平均值口径下前后数值与口径一致', () => {
    const record = createRepairRecord(sourceOf(AGG_CSV, { aggregation: 'mean' }))!;
    expect(record.aggregation).toBe('mean');
    expect(beforeData(record)).toEqual([96, 98]);
    expect(afterData(record)).toEqual([96, 98]);
    expect(describeRepairChanges(record).some((item) => item.value.includes('按类别平均值'))).toBe(true);
  });

  it('展示上限不受修复影响：130 条记录仍只绘制 100 个展示单元', () => {
    const rows = ['g,v'];
    for (let i = 0; i < 130; i += 1) rows.push(`c${i},${i + 100}`);
    const record = createRepairRecord(sourceOf(rows.join('\n'), { raw: '100' }))!;
    expect(record.result.displayedCount).toBe(100);
    expect(record.result.capHidden).toBe(30);
    expect(beforeData(record)).toHaveLength(100);
    expect(afterData(record)).toHaveLength(100);
  });

  it('修复前快照不被后续编辑改写：标题与轴标注停在修复当时的值', () => {
    const source = sourceOf(BASELINE_CSV, {
      configPatch: { title: '修复前的手写标题', titleEdited: true, yAxis: { title: '株高', titleEdited: true, unit: 'cm' } },
    });
    const record = createRepairRecord(source)!;
    const laterConfig: ChartConfig = { ...source.config, title: '修复后我又改了标题', titleEdited: true };
    expect(record.beforeSnapshot.title).toBe('修复前的手写标题');
    expect(String(parts(record.beforeOption).yAxis.name)).toContain('株高');
    expect(parts(record.afterOption).yAxis.name).toBe(parts(record.beforeOption).yAxis.name);
    expect(sameChartConfig(record.afterConfig, laterConfig)).toBe(false);
    expect(sameChartConfig(record.afterConfig, record.afterConfig)).toBe(true);
  });

  it('applyAutoBaselineConfig 只改 yAxisStart，其余配置逐字保留', () => {
    const config: ChartConfig = {
      ...defaultChartConfig(),
      title: '我的图',
      titleEdited: true,
      yAxis: { title: '株高', titleEdited: true, unit: 'cm' },
      yAxisStart: { mode: 'manual', raw: '95' },
    };
    const next = applyAutoBaselineConfig(config);
    expect(next.yAxisStart).toEqual({ mode: 'auto', raw: '' });
    expect(next.title).toBe('我的图');
    expect(next.yAxis).toEqual(config.yAxis);
  });
});

describe('describeRepairStaleness：修复记录的失效边界', () => {
  const source = sourceOf(BASELINE_CSV);
  const record = createRepairRecord(source)!;

  it('状态与记录一致时不过期', () => {
    expect(describeRepairStaleness(record, workbenchOf(source), record.afterConfig)).toBeNull();
  });

  it('换一份 CSV 后过期；同名文件重新加载也算新数据', () => {
    const other = tableOf(BASELINE_CSV, 'baseline-demo.csv');
    expect(describeRepairStaleness(record, workbenchOf(source, { table: other }), record.afterConfig)).toContain('数据文件');
    const sameNameReload = tableOf(BASELINE_CSV, 'lab.csv');
    expect(sameNameReload).not.toBe(source.table);
    expect(describeRepairStaleness(record, workbenchOf(source, { table: sameNameReload }), record.afterConfig)).toContain('数据文件');
  });

  it('切换图表类型后过期', () => {
    expect(describeRepairStaleness(record, workbenchOf(source, { kind: 'scatter' }), record.afterConfig)).toContain('图表类型');
  });

  it('更换 X / Y 字段后过期', () => {
    expect(describeRepairStaleness(record, workbenchOf(source, { yIndex: 2 }), record.afterConfig)).toContain('字段');
    expect(describeRepairStaleness(record, workbenchOf(source, { xIndex: null }), record.afterConfig)).toContain('字段');
  });

  it('修改分类聚合方式后过期', () => {
    expect(describeRepairStaleness(record, workbenchOf(source, { aggregation: 'mean' }), record.afterConfig)).toContain('聚合');
  });

  it('修复后再改 Y 轴起点点名起点；改标题或单位说明是配置编辑', () => {
    const startConfig: ChartConfig = { ...record.afterConfig, yAxisStart: { mode: 'manual', raw: '90' } };
    expect(describeRepairStaleness(record, workbenchOf(source), startConfig)).toContain('Y 轴起点');
    const titleConfig: ChartConfig = { ...record.afterConfig, title: '改了标题', titleEdited: true };
    expect(describeRepairStaleness(record, workbenchOf(source), titleConfig)).toContain('标题或单位');
  });

  it('修复前的配置不会被当成「未过期」', () => {
    expect(describeRepairStaleness(record, workbenchOf(source), record.beforeConfig)).toContain('Y 轴起点');
  });
});

describe('evaluateRepairUndo：撤销的安全边界', () => {
  const source = sourceOf(BASELINE_CSV);
  const record = createRepairRecord(source)!;

  it('记录有效时允许撤销，恢复为修复前的手动起点', () => {
    const evaluation = evaluateRepairUndo(record, workbenchOf(source), record.afterConfig, record.result.yRange);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.message).toContain('95');
    expect(record.beforeConfig.yAxisStart).toEqual({ mode: 'manual', raw: '95' });
  });

  it('记录过期时拒绝撤销并说明原因', () => {
    const evaluation = evaluateRepairUndo(record, workbenchOf(source, { kind: 'line' }), record.afterConfig, record.result.yRange);
    expect(evaluation.ok).toBe(false);
    expect(evaluation.message).toContain('无法撤销');
  });

  it('修复前的起点在当前数据下会变成裁剪时拒绝撤销，不强行写回过期配置', () => {
    const evaluation = evaluateRepairUndo(record, workbenchOf(source), record.afterConfig, { min: 94, max: 98 });
    expect(evaluation.ok).toBe(false);
    expect(evaluation.message).toContain('不能安全应用');
  });

  it('撤销说明不出现越界措辞', () => {
    const evaluation = evaluateRepairUndo(record, workbenchOf(source), record.afterConfig, record.result.yRange);
    expect(evaluation.message).not.toMatch(/科研错误|造假|完全正确|更可信/);
  });
});

describe('配置差异与修复说明', () => {
  const record = createRepairRecord(sourceOf(BASELINE_CSV))!;

  it('diffYAxisStart 给出手动 / 自动的真实文本，完全相同时不产出差异', () => {
    const diff = diffYAxisStart({ mode: 'manual', appliedMin: 95 }, { mode: 'auto', appliedMin: null });
    expect(diff?.before).toBe('手动 95');
    expect(diff?.after).toContain('自动范围');
    expect(diffYAxisStart({ mode: 'auto', appliedMin: null }, { mode: 'auto', appliedMin: null })).toBeNull();
    expect(diffYAxisStart({ mode: 'manual', appliedMin: null }, { mode: 'manual', appliedMin: null })).toBeNull();
  });

  it('差异逐条列出规则、配置项、数据与绘图方法，数字来自记录', () => {
    const items = describeRepairChanges(record);
    const text = JSON.stringify(items);
    expect(items[0].value).toContain('柱状图非零基线');
    expect(items.some((item) => item.value.includes('手动 95 → 自动范围'))).toBe(true);
    expect(text).toContain('图表配置（chartConfig.yAxisStart）');
    expect(items.some((item) => item.label === '原始数据' && item.value.includes('未修改'))).toBe(true);
    expect(items.some((item) => item.label === '数据记录数' && item.value.includes('3 条'))).toBe(true);
  });

  it('对比说明用真实下界，不写死数字、也不宣称下界恰好为 0', () => {
    const note = describeRepairComparison(record);
    expect(note).toContain('修复前的纵轴下界为 95');
    expect(note).toContain('包含 0');
    expect(note).not.toContain('下界为 0');
    expect(describeRepairComparison(createRepairRecord(sourceOf(BASELINE_CSV, { raw: '90' }))!)).toContain('下界为 90');
  });

  it('措辞不越界：不说科研错误已修复、不说图表已经完全正确', () => {
    const text = JSON.stringify(describeRepairChanges(record)) + describeRepairComparison(record);
    expect(text).not.toMatch(/科研错误|造假|完全正确|更可信/);
  });
});
