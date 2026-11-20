import { describe, expect, it } from 'vitest';

import {
  BAR_DISPLAY_CAP,
  LINE_DISPLAY_CAP,
  SCATTER_DISPLAY_CAP,
  aggregateByCategory,
  categoryFieldChoices,
  computeChartData,
  dateFieldChoices,
  defaultSelection,
  escapeHtml,
  evaluateFieldAvailability,
  fieldChoicesForAxis,
  formatTimeTick,
  numericFieldChoices,
  parseTimeCell,
  resolveFieldsForKind,
  summarizeChartScope,
  toEChartsOption,
} from './chartData';
import { analyzeColumnTypes } from './columnTypes';
import { parseCsvText } from './csv';
import { formatComputedValue } from './format';
import type { CategoryGroup, ChartDataResult } from './chartData';
import type { CsvTable } from '../types/csv';

/** UTC 下的一天恒定 86,400,000 毫秒，用它断言刻度是否落在整天上。 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function tableOf(text: string, fileName = 'chart.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`测试数据本该解析成功：${outcome.error.message}`);
  return outcome.table;
}

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

describe('computeChartData：柱状图数据提取', () => {
  it('内置示例 group/height_cm：12 原始、10 有效、2 缺失、0 无效，逐条不聚合', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    expect(result.rawTotal).toBe(12);
    expect(result.validCount).toBe(10);
    expect(result.missingExcluded).toBe(2);
    expect(result.invalidExcluded).toBe(0);
    expect(result.displayedCount).toBe(10);
    expect(result.capHidden).toBe(0);
    expect(result.excludedReasons.empty).toBe(2);
    // 逐条原始记录，重复类别没有被合并成两组（control/treated 各 5 条有效）
    expect(result.points).toHaveLength(10);
    expect(result.points.filter((point) => point.axisLabel.startsWith('control'))).toHaveLength(5);
    expect(result.points.filter((point) => point.axisLabel.startsWith('treated'))).toHaveLength(5);
  });

  it('保留 88.6 与 -4.2 两个真实数值，不被误排除', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const values = result.points.map((point) => point.yValue);
    expect(values).toContain(88.6);
    expect(values).toContain(-4.2);
  });

  it('重复类别附数据行号保证轴标签唯一', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const labels = result.points.map((point) => point.axisLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.filter((label) => label.startsWith('control #'))).toHaveLength(5);
  });

  it('类别本身已含消歧后缀时持续消歧直到唯一（确定性结果）', () => {
    // row0 的原文类别 'A #2' 先占用该标签；row1 的重复类别算出的 'A #2' 与 row2 的原文类别都撞名，
    // 必须继续升级消歧而不是产出重名标签。
    const result = computeChartData(tableOf(['g,v', 'A #2,1', 'A,2', 'A,3'].join('\n')), 'bar', 0, 1);
    expect(result.points.map((point) => point.axisLabel)).toEqual(['A #2', 'A #2 (2)', 'A #3']);
    expect(new Set(result.points.map((point) => point.axisLabel)).size).toBe(3);
  });

  it('大量互撞类别（含 #1/#2 与已有消歧后缀）展示集合内标签全部唯一且可追溯到行号', () => {
    const categories = [
      'A #1',
      'A #2',
      'A',
      'A',
      'A #2',
      'A #1 (2)',
      'A #1 (2)',
      'A',
      'A #2 #3',
      'A #2 #3',
      'A #1',
      'A',
    ];
    const csv = ['g,v', ...categories.map((category, index) => `${category},${index + 1}`)].join('\n');
    const result = computeChartData(tableOf(csv), 'bar', 0, 1);
    const labels = result.points.map((point) => point.axisLabel);

    expect(labels).toHaveLength(12);
    expect(new Set(labels).size).toBe(labels.length);
    // 出现过不止一次的类别，标签里一定带着自己的数据行号，可追溯回原始记录。
    for (const point of result.points) {
      const category = point.rawX.trim();
      const occurrences = categories.filter((entry) => entry.trim() === category).length;
      if (occurrences > 1) expect(point.axisLabel).toContain(`#${point.rowIndex + 1}`);
    }
    // 同一份输入重复计算结果完全一致，消歧不依赖随机或插入顺序之外的因素。
    expect(computeChartData(tableOf(csv), 'bar', 0, 1).points.map((point) => point.axisLabel)).toEqual(labels);
  });
});

describe('computeChartData：散点图与数值转换', () => {
  const SCATTER_CSV = ['x,y', '1,2', '0,-3.5', '2,', '3,abc', '4,5', '-1,0'].join('\n');

  it('散点图使用两个不同数值字段，缺失/文本污染分开计数', () => {
    const table = tableOf(SCATTER_CSV);
    const result = computeChartData(table, 'scatter', 0, 1);
    expect(result.rawTotal).toBe(6);
    expect(result.validCount).toBe(4);
    expect(result.missingExcluded).toBe(1);
    expect(result.invalidExcluded).toBe(1);
    expect(result.excludedReasons.empty).toBe(1);
    expect(result.excludedReasons.nonNumericText).toBe(1);
    // 真实 X/Y 数值成对，0 与负值保留
    expect(result.points.map((point) => [point.xValue, point.yValue])).toEqual([
      [1, 2],
      [0, -3.5],
      [4, 5],
      [-1, 0],
    ]);
  });

  it('数量互斥且每个被排除记录只计一次', () => {
    const table = tableOf(SCATTER_CSV);
    const result = computeChartData(table, 'scatter', 0, 1);
    expect(result.validCount + result.missingExcluded + result.invalidExcluded).toBe(result.rawTotal);
    expect(
      result.excludedReasons.structuralNull +
        result.excludedReasons.empty +
        result.excludedReasons.whitespace,
    ).toBe(result.missingExcluded);
    expect(result.excludedReasons.nonNumericText + result.excludedReasons.nonFinite).toBe(result.invalidExcluded);
  });

  it('1e999 这类非有限数值被排除，不进入图表数据', () => {
    const table = tableOf(['x,y', '1,1e999', '2,5', '3,7', '4,9'].join('\n'));
    const result = computeChartData(table, 'scatter', 0, 1);
    expect(result.invalidExcluded).toBe(1);
    expect(result.excludedReasons.nonFinite).toBe(1);
    expect(result.validCount).toBe(3);
    expect(result.points.every((point) => Number.isFinite(point.yValue) && Number.isFinite(point.xValue))).toBe(true);
  });
});

describe('computeChartData：缺失三分类与结构缺列', () => {
  it('空字符串、纯空白、结构性缺列分别归类', () => {
    const table = tableOf(
      ['x,y', '1,2', '3," "', '5,', '7'].join('\n'), // '3," "' 空白、'5,' 空串、'7' 缺列
    );
    // x 列里第 4 行 '7' 只有一列，y 为结构性缺列
    const result = computeChartData(table, 'scatter', 0, 1);
    expect(result.excludedReasons.whitespace).toBe(1);
    expect(result.excludedReasons.empty).toBe(1);
    expect(result.excludedReasons.structuralNull).toBe(1);
    expect(result.missingExcluded).toBe(3);
  });

  it('数值 0 不算缺失、负值照常绘制', () => {
    const table = tableOf(['x,y', '0,0', '-5,-2'].join('\n'));
    const result = computeChartData(table, 'scatter', 0, 1);
    expect(result.validCount).toBe(2);
    expect(result.missingExcluded).toBe(0);
    expect(result.points.map((point) => point.yValue)).toEqual([0, -2]);
  });
});

describe('computeChartData：完整数据集与展示上限', () => {
  it('有效记录不受 50 行分页限制（统计整份数据集）', () => {
    const lines = ['g,v'];
    for (let index = 1; index <= 60; index += 1) lines.push(`cat${index},${index}`);
    const table = tableOf(lines.join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    expect(result.rawTotal).toBe(60);
    expect(result.validCount).toBe(60);
  });

  it('柱状图超过上限只展示前 100 条并统计 capHidden', () => {
    const lines = ['g,v'];
    for (let index = 1; index <= 130; index += 1) lines.push(`cat,${index}`);
    const table = tableOf(lines.join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    expect(result.cap).toBe(BAR_DISPLAY_CAP);
    expect(result.validCount).toBe(130);
    expect(result.displayedCount).toBe(BAR_DISPLAY_CAP);
    expect(result.capHidden).toBe(30);
    expect(result.missingExcluded).toBe(0);
    // 截断后仍保持类别标签唯一
    const labels = result.points.map((point) => point.axisLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('散点图超过上限只展示前 2000 条', () => {
    const lines = ['x,y'];
    for (let index = 1; index <= 2100; index += 1) lines.push(`${index},${index * 2}`);
    const table = tableOf(lines.join('\n'));
    const result = computeChartData(table, 'scatter', 0, 1);
    expect(result.cap).toBe(SCATTER_DISPLAY_CAP);
    expect(result.displayedCount).toBe(SCATTER_DISPLAY_CAP);
    expect(result.capHidden).toBe(100);
  });
});

describe('computeChartData：只读约束', () => {
  it('不修改原始 table.rows 的引用与取值', () => {
    const table = tableOf(PLANT_CSV);
    const snapshot = JSON.stringify(table.rows);
    const refs = table.rows.map((row) => row);
    const result = computeChartData(table, 'bar', 2, 3);
    toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm' });
    expect(JSON.stringify(table.rows)).toBe(snapshot);
    expect(table.rows.every((row, index) => row === refs[index])).toBe(true);
  });
});

describe('字段适配与默认选择', () => {
  it('示例数据默认柱状图 X=group（跳过标识符 sample_id）、Y=height_cm', () => {
    const table = tableOf(PLANT_CSV);
    const columnTypes = analyzeColumnTypes(table);
    const selection = defaultSelection(columnTypes, 'bar');
    expect(selection.ready).toBe(true);
    expect(selection.x).toBe(2); // group
    expect(selection.y).toBe(3); // height_cm
    const categoryLabels = categoryFieldChoices(columnTypes).map((choice) => choice.label);
    expect(categoryLabels).toContain('group');
    expect(categoryLabels).toContain('sample_id');
  });

  it('示例数据只有一个数值字段，散点图不可用', () => {
    const table = tableOf(PLANT_CSV);
    const columnTypes = analyzeColumnTypes(table);
    const selection = defaultSelection(columnTypes, 'scatter');
    expect(selection.ready).toBe(false);
    expect(numericFieldChoices(columnTypes).map((choice) => choice.index)).toEqual([3]);
  });

  it('date 与无法确定的字段不进入数值轴候选，unknown 不被强行判数值', () => {
    const table = tableOf(['id,when,mixed', '1,2026-01-01,a', '2,2026-01-02,5', '3,2026-01-03,b', '4,2026-01-04,7'].join('\n'));
    const columnTypes = analyzeColumnTypes(table);
    const numericIndexes = numericFieldChoices(columnTypes).map((choice) => choice.index);
    expect(numericIndexes).not.toContain(1); // date 列不是数值轴候选
    for (const profile of columnTypes.columns) {
      if (profile.kind === 'unknown') expect(numericIndexes).not.toContain(profile.index);
    }
  });
});

describe('toEChartsOption', () => {
  it('柱状图不固定最小值为 0，负值不被裁剪', () => {
    const table = tableOf(['g,v', 'a,-5', 'b,3', 'c,7'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'g', yLabel: 'v' });
    const yAxis = option.yAxis as Record<string, unknown>;
    expect(yAxis.min).toBeUndefined();
    expect(yAxis.scale).toBe(false);
    const series = (option.series as Record<string, unknown>[])[0];
    expect(series.type).toBe('bar');
    expect(series.data).toEqual([-5, 3, 7]);
  });

  it('柱状图 meta.yMin 为有限值时写进真实 ECharts yAxis.min（Day 7 起点）', () => {
    const table = tableOf(['g,v', 'A,96', 'B,98'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'g', yLabel: 'v', yMin: 95 });
    const yAxis = option.yAxis as Record<string, unknown>;
    expect(yAxis.min).toBe(95);
    expect(yAxis.scale).toBe(false);
    // 数值不被改写：数据点仍是真实的 96 / 98。
    const series = (option.series as Record<string, unknown>[])[0];
    expect(series.data).toEqual([96, 98]);
  });

  it('柱状图 meta.yMin 非有限时忽略，绝不把 NaN / Infinity 放进坐标轴', () => {
    const table = tableOf(['g,v', 'A,96', 'B,98'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'g', yLabel: 'v', yMin: Number.NaN });
    const yAxis = option.yAxis as Record<string, unknown>;
    expect(yAxis.min).toBeUndefined();
  });

  it('柱状图不传 meta.yMin 时整个 min 键都不出现（Day 7 整改：配合 notMerge 退回自动范围）', () => {
    const table = tableOf(['g,v', 'A,96', 'B,98'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const yAxis = toEChartsOption(result, { xLabel: 'g', yLabel: 'v' }).yAxis as Record<string, unknown>;
    // 只写 `min: undefined` 在合并语义下仍可能被当成「沿用上一次的下界」，因此这里必须是不含 min 键。
    expect('min' in yAxis).toBe(false);
    expect(yAxis.scale).toBe(false);
  });

  it('起点等于数据最小值时该下界照样真实写进 yAxis.min', () => {
    const table = tableOf(['g,v', 'A,96', 'B,98'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const yAxis = toEChartsOption(result, { xLabel: 'g', yLabel: 'v', yMin: 96 }).yAxis as Record<string, unknown>;
    expect(yAxis.min).toBe(96);
    const series = (result.points ?? []).map((point) => point.yValue);
    expect(series).toEqual([96, 98]);
  });

  it('散点图 / 折线图忽略 yMin，不套用柱状图起点', () => {
    const scatter = toEChartsOption(computeChartData(tableOf(['x,y', '1,2'].join('\n')), 'scatter', 0, 1), {
      xLabel: 'x',
      yLabel: 'y',
      yMin: 95,
    });
    expect((scatter.yAxis as Record<string, unknown>).min).toBeUndefined();
  });

  it('散点图 scale 为 true 且数据是真实的 [x, y] 对', () => {
    const table = tableOf(['x,y', '1,2', '3,4'].join('\n'));
    const result = computeChartData(table, 'scatter', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'x', yLabel: 'y' });
    const xAxis = option.xAxis as Record<string, unknown>;
    expect(xAxis.type).toBe('value');
    expect(xAxis.scale).toBe(true);
    const series = (option.series as Record<string, unknown>[])[0];
    expect(series.type).toBe('scatter');
    expect(series.data).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('tooltip formatter 对 CSV 原文做 HTML 转义', () => {
    const table = tableOf(['x,y', '<img onerror=alert(1)>,5'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'x', yLabel: 'y' });
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    const html = tooltip.formatter({ dataIndex: 0 });
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).toContain('数据行号：1');
  });

  it('坐标轴标签过长时视觉缩略但 tooltip 保留全文', () => {
    const table = tableOf(['g,v', '这是一个非常非常长的类别名称,5'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'g', yLabel: 'v' });
    const xAxis = option.xAxis as { axisLabel: { formatter: (value: string) => string } };
    const shown = xAxis.axisLabel.formatter(result.points[0].axisLabel);
    expect(shown.length).toBeLessThanOrEqual(13);
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    expect(tooltip.formatter({ dataIndex: 0 })).toContain('这是一个非常非常长的类别名称');
  });

  it('Canvas 坐标轴标签保留原文可读形式，不出现 HTML 实体', () => {
    const table = tableOf(['g,v', 'A&B,1', '<x>,2', 'a>b,3'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    expect(result.points.map((point) => point.axisLabel)).toEqual(['A&B', '<x>', 'a>b']);

    const option = toEChartsOption(result, { xLabel: 'g', yLabel: 'v' });
    const axisLabel = (option.xAxis as { axisLabel: { formatter: (value: string) => string } }).axisLabel;
    expect(axisLabel.formatter('A&B')).toBe('A&B');
    expect(axisLabel.formatter('<x>')).toBe('<x>');
    expect(axisLabel.formatter('a>b')).toBe('a>b');
  });

  it('轴标签缩略保留 & < > 原文，同时 tooltip 仍然必须 HTML 转义', () => {
    const table = tableOf(['g,v', 'A&B&C<D&E>F&G,1'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'g', yLabel: 'v' });
    const axisLabel = (option.xAxis as { axisLabel: { formatter: (value: string) => string } }).axisLabel;
    const shown = axisLabel.formatter(result.points[0].axisLabel);
    expect(shown.endsWith('…')).toBe(true);
    expect(shown).toContain('&');
    expect(shown).not.toContain('&amp;');
    expect(shown).not.toContain('&lt;');

    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    const html = tooltip.formatter({ dataIndex: 0 });
    expect(html).toContain('A&amp;B&amp;C&lt;D&amp;E&gt;F');
    expect(html).not.toContain('<D');
  });
});

describe('escapeHtml', () => {
  it('转义所有 HTML 特殊字符', () => {
    expect(escapeHtml(`<a href="x">'b'&c</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;b&#39;&amp;c&lt;/a&gt;',
    );
  });
});

// ===== Day 6：分类聚合、时间序列折线图与口径说明 =====
const CONTEXT = { xLabel: 'group', yLabel: 'height_cm', title: '柱状图：按 group 计算 height_cm 平均值' };

describe('aggregateByCategory：按类别平均与求和（纯函数）', () => {
  const samples = [
    { rowIndex: 0, category: 'control', value: 12.4, rawValue: '12.4' },
    { rowIndex: 2, category: 'control', value: 13.0, rawValue: '13.0' },
    { rowIndex: 4, category: 'control', value: 12.7, rawValue: '12.7' },
    { rowIndex: 8, category: 'control', value: 13.5, rawValue: '13.5' },
    { rowIndex: 10, category: 'control', value: 14.1, rawValue: '14.1' },
    { rowIndex: 1, category: 'treated', value: 15.1, rawValue: '15.1' },
    { rowIndex: 5, category: 'treated', value: 88.6, rawValue: '88.6' },
    { rowIndex: 7, category: 'treated', value: 16.8, rawValue: '16.8' },
    { rowIndex: 9, category: 'treated', value: -4.2, rawValue: '-4.2' },
    { rowIndex: 11, category: 'treated', value: 15.9, rawValue: '15.9' },
  ];

  it('内置示例两组平均值与样本数正确', () => {
    const groups = aggregateByCategory(samples, 'mean');
    expect(groups.map((group) => group.key)).toEqual(['control', 'treated']);
    expect(groups.map((group) => group.samples.length)).toEqual([5, 5]);
    expect(groups[0].value).toBeCloseTo(13.14, 10);
    expect(groups[1].value).toBeCloseTo(26.44, 10);
    // 展示文本最多 6 位有效缩略，计算本身仍是完整精度浮点数。
    expect(formatComputedValue(groups[0].value, 2)).toBe('13.14');
    expect(formatComputedValue(groups[1].value, 2)).toBe('26.44');
  });

  it('求和模式按组内累加，负值参与', () => {
    const groups = aggregateByCategory(samples, 'sum');
    expect(groups[0].value).toBeCloseTo(65.7, 10);
    expect(groups[1].value).toBeCloseTo(132.2, 10);
    expect(groups[1].samples.map((sample) => sample.value)).toContain(-4.2);
  });

  it('只有一条记录的类别结果等于该记录本身', () => {
    const groups = aggregateByCategory([{ rowIndex: 3, category: 'solo', value: 7.5, rawValue: '7.5' }], 'mean');
    expect(groups).toHaveLength(1);
    expect(groups[0].value).toBe(7.5);
    expect(groups[0].samples).toHaveLength(1);
    expect(groups[0].firstRowIndex).toBe(3);
  });

  it('0 与负数照常参与计算，不被当成缺失', () => {
    const groups = aggregateByCategory(
      [
        { rowIndex: 0, category: 'z', value: 0, rawValue: '0' },
        { rowIndex: 1, category: 'z', value: -2, rawValue: '-2' },
      ],
      'mean',
    );
    expect(groups[0].value).toBe(-1);
    expect(groups[0].samples.length).toBe(2);
  });

  it('大小写与写法不同的类别不会被合并；首尾空白除外', () => {
    const groups = aggregateByCategory(
      [
        { rowIndex: 0, category: 'control', value: 1, rawValue: '1' },
        { rowIndex: 1, category: 'Control', value: 3, rawValue: '3' },
        { rowIndex: 2, category: '1', value: 5, rawValue: '5' },
        { rowIndex: 3, category: '1.0', value: 7, rawValue: '7' },
      ],
      'mean',
    );
    expect(groups.map((group) => group.key)).toEqual(['control', 'Control', '1', '1.0']);
  });

  it('分组保持类别首次出现顺序，组内样本保持上传顺序并可追溯行号', () => {
    const groups = aggregateByCategory(samples, 'mean');
    expect(groups[0].samples.map((sample) => sample.rowIndex)).toEqual([0, 2, 4, 8, 10]);
    expect(groups[1].samples.map((sample) => sample.rowIndex)).toEqual([1, 5, 7, 9, 11]);
    expect(groups[1].samples.map((sample) => sample.rawValue)).toContain('88.6');
  });

  it('聚合不修改传入样本，结果对象是新构造的', () => {
    const copy = samples.map((sample) => ({ ...sample }));
    const groups = aggregateByCategory(samples, 'mean');
    expect(samples).toEqual(copy);
    expect(groups[0].samples[0]).not.toBe(samples[0]);
    expect(groups[0].samples[0]).toEqual(samples[0]);
  });

  it('空输入得到空结果，不产生 0 除以 0 的假平均值', () => {
    expect(aggregateByCategory([], 'mean')).toEqual([]);
    expect(aggregateByCategory([], 'sum')).toEqual([]);
  });
});

describe('aggregateByCategory：极端大数与求和溢出', () => {
  function groupOf(values: number[], method: 'mean' | 'sum'): CategoryGroup {
    const groups = aggregateByCategory(
      values.map((value, index) => ({ rowIndex: index, category: 'a', value, rawValue: String(value) })),
      method,
    );
    expect(groups).toHaveLength(1);
    return groups[0];
  }

  it('两个 1e308 的平均值是 1e308，不被中间求和的溢出带成 Infinity', () => {
    const group = groupOf([1e308, 1e308], 'mean');
    expect(group.value).toBe(1e308);
    expect(Number.isFinite(group.value)).toBe(true);
    expect(group.representable).toBe(true);
  });

  it('同样两个数求和确实超出可表示范围：如实标注不可表示，样本与行号照旧保留', () => {
    const group = groupOf([1e308, 1e308], 'sum');
    expect(group.value).toBe(Number.POSITIVE_INFINITY);
    expect(group.representable).toBe(false);
    expect(group.samples.map((sample) => sample.rowIndex)).toEqual([0, 1]);
    expect(group.samples.map((sample) => sample.value)).toEqual([1e308, 1e308]);
  });

  it('负向极端值同样处理：平均值 -1e308 可表示，求和 -Infinity 不可表示', () => {
    const mean = groupOf([-1e308, -1e308], 'mean');
    expect(mean.value).toBe(-1e308);
    expect(mean.representable).toBe(true);
    const sum = groupOf([-1e308, -1e308], 'sum');
    expect(sum.value).toBe(Number.NEGATIVE_INFINITY);
    expect(sum.representable).toBe(false);
  });

  it('Number.MAX_VALUE 成对时平均值仍可表示', () => {
    const group = groupOf([Number.MAX_VALUE, Number.MAX_VALUE], 'mean');
    expect(group.value).toBe(Number.MAX_VALUE);
    expect(group.representable).toBe(true);
  });

  it('中间溢出但真实结果可表示时，按真实值返回', () => {
    const group = groupOf([1.5e308, 1.5e308, -1.5e308], 'sum');
    expect(group.value).toBe(1.5e308);
    expect(group.representable).toBe(true);
  });

  it('正负抵消不把低位吞掉，且与记录顺序无关', () => {
    expect(groupOf([1, 1e308, -1e308], 'sum').value).toBe(1);
    expect(groupOf([1e308, -1e308, 1], 'sum').value).toBe(1);
    expect(groupOf([-1e308, 1, 1e308], 'sum').value).toBe(1);
    expect(groupOf([1, 1e308, -1e308], 'mean').value).toBeCloseTo(1 / 3, 15);
  });

  it('普通数据不受影响：补偿求和只是把朴素累加丢掉的低位收回来', () => {
    const control = [12.4, 13.0, 12.7, 13.5, 14.1];
    expect(groupOf(control, 'sum').value).toBe(65.7);
    expect(groupOf(control, 'mean').value).toBe(13.14);
    expect(groupOf([0.1, 0.2, 0.3], 'sum').value).toBe(0.6);
    expect(groupOf([0, -2], 'mean').value).toBe(-1);
    expect(groupOf([7.5], 'mean').value).toBe(7.5);
    expect(groupOf([7.5], 'sum').value).toBe(7.5);
  });
});

describe('computeChartData：聚合模式的统计口径', () => {
  it('平均值模式一个类别一根柱子，柱子数与有效记录数分别统计', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'mean');
    expect(result.aggregation).toBe('mean');
    expect(result.rawTotal).toBe(12);
    expect(result.validCount).toBe(10);
    expect(result.missingExcluded).toBe(2);
    expect(result.categoryTotal).toBe(2);
    expect(result.displayedCount).toBe(2);
    expect(result.points.map((point) => point.axisLabel)).toEqual(['control', 'treated']);
    expect(result.points.map((point) => point.sources.length)).toEqual([5, 5]);
  });

  it('缺失与无效记录既不进入分子也不进入分母', () => {
    const table = tableOf(['g,v', 'a,2', 'a,', 'a,x', 'a,4'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1, 'mean');
    expect(result.validCount).toBe(2);
    expect(result.missingExcluded).toBe(1);
    expect(result.invalidExcluded).toBe(1);
    expect(result.groups[0].samples.length).toBe(2);
    expect(result.groups[0].value).toBe(3);
    expect(result.excludedReasons.nonNumericText).toBe(1);
  });

  it('聚合点保留组内全部原始行号与原文，供报告与证据追溯', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'mean');
    const treated = result.points[1];
    expect(treated.rowIndex).toBe(1);
    expect(treated.sources.map((source) => source.rowIndex)).toEqual([1, 5, 7, 9, 11]);
    expect(treated.sources.map((source) => source.rawY)).toEqual(['15.1', '88.6', '16.8', '-4.2', '15.9']);
    expect(treated.rawX).toBe('treated');
  });

  it('原始记录模式保持 Day 5 行为：10 根柱子、逐条不合并', () => {
    const table = tableOf(PLANT_CSV);
    const raw = computeChartData(table, 'bar', 2, 3, 'raw');
    expect(raw.aggregation).toBe('raw');
    expect(raw.displayedCount).toBe(10);
    expect(raw.categoryTotal).toBeNull();
    expect(raw.hiddenCategoryCount).toBe(0);
    expect(raw.points.filter((point) => point.axisLabel.startsWith('control'))).toHaveLength(5);
  });

  it('类别组超过展示上限时，未展示的组数与其包含的记录数分开统计', () => {
    const rows = ['g,v'];
    for (let index = 0; index < 120; index += 1) {
      rows.push(`c${index},${index}`);
      rows.push(`c${index},10`);
    }
    const table = tableOf(rows.join('\n'));
    const result = computeChartData(table, 'bar', 0, 1, 'mean');
    expect(result.categoryTotal).toBe(120);
    expect(result.groups).toHaveLength(100);
    expect(result.hiddenCategoryCount).toBe(20);
    expect(result.displayedCount).toBe(100);
    expect(result.validCount).toBe(240);
    expect(result.capHidden).toBe(40);
    // 展示集合内没有因为截断把不同类别并到一起。
    expect(new Set(result.points.map((point) => point.axisLabel)).size).toBe(100);
  });

  it('求和模式与平均值模式共用同一套有效记录判定', () => {
    const table = tableOf(PLANT_CSV);
    const sum = computeChartData(table, 'bar', 2, 3, 'sum');
    const mean = computeChartData(table, 'bar', 2, 3, 'mean');
    expect(sum.validCount).toBe(mean.validCount);
    expect(sum.missingExcluded).toBe(mean.missingExcluded);
    expect(sum.groups[1].value).toBeCloseTo(132.2, 10);
    expect(mean.groups[1].value).toBeCloseTo(26.44, 10);
  });

  it('散点图与折线图即使传入聚合口径也回到逐条记录', () => {
    const table = tableOf(['x,y', '1,2', '1,3'].join('\n'));
    const scatter = computeChartData(table, 'scatter', 0, 1, 'mean');
    expect(scatter.aggregation).toBe('raw');
    expect(scatter.displayedCount).toBe(2);
    expect(scatter.groups).toEqual([]);
  });

  it('聚合与时间序列都不修改原始 rows', () => {
    const table = tableOf(PLANT_CSV);
    const before = table.rows.map((row) => [...row]);
    computeChartData(table, 'bar', 2, 3, 'mean');
    computeChartData(table, 'line', 1, 3);
    expect(table.rows).toEqual(before);
  });

  it('聚合数值范围按聚合后的柱子计算', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'mean');
    expect(result.yRange).toEqual({ min: expect.any(Number), max: expect.any(Number) });
    expect(result.yRange?.min).toBeCloseTo(13.14, 10);
    expect(result.yRange?.max).toBeCloseTo(26.44, 10);
  });
});

describe('computeChartData：聚合结果无法有限表示的类别组', () => {
  const OVERFLOW_CSV = ['group,value', 'a,1e308', 'a,1e308', 'b,2', 'b,3'].join('\n');
  const OVERFLOW_CONTEXT = { xLabel: 'group', yLabel: 'value', title: '柱状图：按 group 计算 value 求和' };

  function seriesOf(result: ChartDataResult): number[] {
    const option = toEChartsOption(result, { xLabel: 'group', yLabel: 'value' });
    const series = (option.series as Array<{ data: number[] }>)[0];
    return series.data;
  }

  it('求和溢出的一组不成柱，但记录仍算有效、不算类型排除', () => {
    const result = computeChartData(tableOf(OVERFLOW_CSV), 'bar', 0, 1, 'sum');
    expect(result.validCount).toBe(4);
    expect(result.missingExcluded).toBe(0);
    expect(result.invalidExcluded).toBe(0);
    expect(result.excludedReasons.nonFinite).toBe(0);
    expect(result.categoryTotal).toBe(2);
    expect(result.displayedCount).toBe(1);
    expect(result.groups.map((group) => group.key)).toEqual(['b']);
    expect(result.overflowGroups.map((group) => group.key)).toEqual(['a']);
    expect(result.capHidden).toBe(0);
    expect(result.yRange).toEqual({ min: 5, max: 5 });
  });

  it('不可表示组保留原始记录、样本数与来源行号', () => {
    const result = computeChartData(tableOf(OVERFLOW_CSV), 'bar', 0, 1, 'sum');
    const group = result.overflowGroups[0];
    expect(group.value).toBe(Number.POSITIVE_INFINITY);
    expect(group.representable).toBe(false);
    expect(group.samples.length).toBe(2);
    expect(group.firstRowIndex).toBe(0);
    expect(group.samples.map((sample) => sample.rowIndex)).toEqual([0, 1]);
    expect(group.samples.map((sample) => sample.rawValue)).toEqual(['1e308', '1e308']);
    expect(group.samples.map((sample) => Number.isFinite(sample.value))).toEqual([true, true]);
  });

  it('ECharts 数据点与数值范围里都不出现 NaN / Infinity', () => {
    const result = computeChartData(tableOf(OVERFLOW_CSV), 'bar', 0, 1, 'sum');
    expect(seriesOf(result)).toEqual([5]);
    expect(result.points.every((point) => Number.isFinite(point.yValue))).toBe(true);
  });

  it('同一份数据改用平均值口径时两根柱子都画得出来', () => {
    const result = computeChartData(tableOf(OVERFLOW_CSV), 'bar', 0, 1, 'mean');
    expect(result.overflowGroups).toEqual([]);
    expect(result.displayedCount).toBe(2);
    expect(result.points.map((point) => point.yValue)).toEqual([1e308, 2.5]);
    expect(result.capHidden).toBe(0);
  });

  it('不可表示组不占用展示上限名额，触顶统计仍只按上限计算', () => {
    const rows = ['group,value', 'huge,1e308', 'huge,1e308'];
    for (let index = 0; index < 120; index += 1) {
      rows.push(`c${index},${index + 1}`);
      rows.push(`c${index},10`);
    }
    const result = computeChartData(tableOf(rows.join('\n')), 'bar', 0, 1, 'sum');
    expect(result.categoryTotal).toBe(121);
    expect(result.overflowGroups).toHaveLength(1);
    expect(result.groups).toHaveLength(100);
    expect(result.hiddenCategoryCount).toBe(20);
    expect(result.displayedCount).toBe(100);
    expect(result.validCount).toBe(242);
    // 上限之外的 20 组 × 2 条才是 capHidden；溢出组的 2 条另算，不被说成触顶。
    expect(result.capHidden).toBe(40);
    expect(seriesOf(result).every((value) => Number.isFinite(value))).toBe(true);
  });

  it('逐条模式不受影响：1e308 本身是有效数值，照常成柱', () => {
    const result = computeChartData(tableOf(OVERFLOW_CSV), 'bar', 0, 1);
    expect(result.overflowGroups).toEqual([]);
    expect(result.displayedCount).toBe(4);
    expect(result.points.map((point) => point.yValue)).toEqual([1e308, 1e308, 2, 3]);
  });

  it('口径说明把「聚合结果不可表示」与「原始数值无效」分开陈述', () => {
    const result = computeChartData(tableOf(OVERFLOW_CSV), 'bar', 0, 1, 'sum');
    const scope = summarizeChartScope(result, OVERFLOW_CONTEXT);
    expect(scope.overflowNote).toContain('1 个类别组（共 2 条记录）的聚合结果');
    expect(scope.overflowNote).toContain('没有被算进「类型不符排除」');
    expect(scope.headline).toContain('符合条件的有效记录 4 条');
    expect(scope.headline).toContain('因类型不符或非有限数值排除 0 条');
    expect(scope.capNote).toBeNull();
    expect(scope.description).toContain('聚合结果无法有限表示、未成柱');
  });

  it('没有不可表示组时不输出多余提示', () => {
    const result = computeChartData(tableOf(PLANT_CSV), 'bar', 2, 3, 'sum');
    expect(result.overflowGroups).toEqual([]);
    expect(summarizeChartScope(result, { xLabel: 'group', yLabel: 'height_cm', title: '柱状图' }).overflowNote).toBeNull();
  });
});

describe('parseTimeCell：时间轴取值判定', () => {
  it('能定位到具体日期的写法映射为 UTC 毫秒', () => {
    expect(parseTimeCell('2026-03-02')).toEqual({ state: 'valid', epochMs: Date.UTC(2026, 2, 2) });
    expect(parseTimeCell('2026/3/2')).toEqual({ state: 'valid', epochMs: Date.UTC(2026, 2, 2) });
    expect(parseTimeCell('2026-03-02T08:15')).toEqual({ state: 'valid', epochMs: Date.UTC(2026, 2, 2, 8, 15) });
    expect(parseTimeCell('2026-03-02 08:15:30')).toEqual({ state: 'valid', epochMs: Date.UTC(2026, 2, 2, 8, 15, 30) });
  });

  it('只到年月的精度不足，明确排除而不是补成某月第一天', () => {
    expect(parseTimeCell('2026-03')).toEqual({ state: 'invalid', invalidKind: 'coarseDate' });
    expect(parseTimeCell('2026/03')).toEqual({ state: 'invalid', invalidKind: 'coarseDate' });
    expect(parseTimeCell('2026')).toEqual({ state: 'invalid', invalidKind: 'nonDateText' });
  });

  it('日历上不存在的日期被排除', () => {
    expect(parseTimeCell('2026-02-30')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('2026-13-01')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('2026-04-31')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('2026-02-29')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('2028-02-29')).toEqual({ state: 'valid', epochMs: Date.UTC(2028, 1, 29) });
  });

  it('地区歧义写法与带时区偏移的写法按“不是支持的日期写法”排除，不依赖 Date.parse', () => {
    expect(parseTimeCell('03/02/2026')).toEqual({ state: 'invalid', invalidKind: 'nonDateText' });
    expect(parseTimeCell('2026-03-02T08:15:00+08:00')).toEqual({ state: 'invalid', invalidKind: 'nonDateText' });
    expect(parseTimeCell('March 2, 2026')).toEqual({ state: 'invalid', invalidKind: 'nonDateText' });
    expect(parseTimeCell('不是日期')).toEqual({ state: 'invalid', invalidKind: 'nonDateText' });
  });

  it('缺失三分类与结构缺列分开归类', () => {
    expect(parseTimeCell('')).toEqual({ state: 'missing', missingKind: 'empty' });
    expect(parseTimeCell('   ')).toEqual({ state: 'missing', missingKind: 'whitespace' });
    expect(parseTimeCell(null)).toEqual({ state: 'missing', missingKind: 'structuralNull' });
  });
});

describe('parseTimeCell：四位早年份按字面年份解释（Date.UTC 的 0–99 补年规则）', () => {
  function epochOf(cell: string): number {
    const evaluation = parseTimeCell(cell);
    if (evaluation.state !== 'valid') throw new Error(`${cell} 本该按有效日期解析`);
    return evaluation.epochMs;
  }
  const isoOf = (cell: string): string => new Date(epochOf(cell)).toISOString();

  it('0001 / 0099 / 0100 的时间戳落回输入年份本身', () => {
    expect(isoOf('0001-01-01')).toBe('0001-01-01T00:00:00.000Z');
    expect(isoOf('0099-02-28')).toBe('0099-02-28T00:00:00.000Z');
    expect(isoOf('0099-12-31')).toBe('0099-12-31T00:00:00.000Z');
    expect(isoOf('0100-01-01')).toBe('0100-01-01T00:00:00.000Z');
    expect(isoOf('0001-01-01 23:59:59')).toBe('0001-01-01T23:59:59.000Z');
  });

  it('0099 不再被挪到 1999，且 0099-12-31 的次日就是 0100-01-01', () => {
    expect(epochOf('0099-02-28')).not.toBe(Date.UTC(1999, 1, 28));
    expect(epochOf('0099-12-31') + MS_PER_DAY).toBe(epochOf('0100-01-01'));
  });

  it('现代日期的结果与修复前逐位一致', () => {
    expect(epochOf('2026-03-02')).toBe(Date.UTC(2026, 2, 2));
    expect(epochOf('2026-03-02 08:15:30')).toBe(Date.UTC(2026, 2, 2, 8, 15, 30));
    expect(epochOf('1999-12-31')).toBe(Date.UTC(1999, 11, 31));
  });

  it('形态与日历合法性规则照旧：0 年不接受、非闰年的 2 月 29 日排除、整百年按格里高利规则判断', () => {
    expect(parseTimeCell('0000-01-01')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('0099-02-29')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('0100-02-29')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('0099-13-01')).toEqual({ state: 'invalid', invalidKind: 'invalidDate' });
    expect(parseTimeCell('0099-03')).toEqual({ state: 'invalid', invalidKind: 'coarseDate' });
    expect(isoOf('0400-02-29')).toBe('0400-02-29T00:00:00.000Z');
  });

  it('折线图里 0099 与 1999 是两个不同时刻，按时间先后排列', () => {
    const table = tableOf(['d,v', '1999-12-31,1', '0099-12-31,2'].join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    expect(result.timeRange).toEqual({ min: epochOf('0099-12-31'), max: epochOf('1999-12-31') });
    expect(result.points.map((point) => point.rowIndex)).toEqual([1, 0]);
    expect(result.points.map((point) => point.yValue)).toEqual([2, 1]);
    expect(formatTimeTick(epochOf('0099-12-31'))).toBe('0099-12-31');
  });
});

describe('computeChartData：时间序列折线图', () => {
  it('内置示例按日期绘制 10 条有效观测，2 条缺失记录单独统计', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'line', 1, 3);
    expect(result.kind).toBe('line');
    expect(result.aggregation).toBe('raw');
    expect(result.rawTotal).toBe(12);
    expect(result.validCount).toBe(10);
    expect(result.displayedCount).toBe(10);
    expect(result.missingExcluded).toBe(2);
    expect(result.excludedReasons.empty).toBe(2);
    expect(result.timeRange).toEqual({ min: Date.UTC(2026, 2, 2), max: Date.UTC(2026, 2, 7) });
    expect(result.points.map((point) => point.xValue)).toEqual([
      Date.UTC(2026, 2, 2),
      Date.UTC(2026, 2, 2),
      Date.UTC(2026, 2, 3),
      Date.UTC(2026, 2, 4),
      Date.UTC(2026, 2, 4),
      Date.UTC(2026, 2, 5),
      Date.UTC(2026, 2, 6),
      Date.UTC(2026, 2, 6),
      Date.UTC(2026, 2, 7),
      Date.UTC(2026, 2, 7),
    ]);
  });

  it('按时间升序排列，同一时刻保留原始记录顺序，不合并同一天', () => {
    const table = tableOf(['d,v', '2026-03-05,5', '2026-03-02,1', '2026-03-02,2', '2026-03-03,3'].join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    expect(result.points.map((point) => point.rowIndex)).toEqual([1, 2, 3, 0]);
    expect(result.points.map((point) => point.yValue)).toEqual([1, 2, 3, 5]);
    expect(result.displayedCount).toBe(4);
  });

  it('非法日期、只有年月、非日期写法按原因分别排除，不进绘图结果', () => {
    const table = tableOf(
      ['d,v', '2026-03-02,1', '2026-02-30,2', '2026-03,3', '03/02/2026,4', '2026-03-04,5'].join('\n'),
    );
    const result = computeChartData(table, 'line', 0, 1);
    expect(result.validCount).toBe(2);
    expect(result.invalidExcluded).toBe(3);
    expect(result.excludedReasons.invalidDate).toBe(1);
    expect(result.excludedReasons.coarseDate).toBe(1);
    expect(result.excludedReasons.nonDateText).toBe(1);
    expect(result.points.map((point) => point.rawX)).toEqual(['2026-03-02', '2026-03-04']);
  });

  it('折线图的 X 缺失与 Y 缺失分开统计，缺失数值不会被补成 0', () => {
    const table = tableOf(['d,v', '2026-03-02,1', ',2', '2026-03-03,', '   ,4'].join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    expect(result.validCount).toBe(1);
    expect(result.missingExcluded).toBe(3);
    expect(result.excludedReasons.empty).toBe(2);
    expect(result.excludedReasons.whitespace).toBe(1);
    expect(result.points.every((point) => point.yValue !== 0)).toBe(true);
  });

  it('0 与负值照常进入折线图', () => {
    const table = tableOf(['d,v', '2026-03-02,0', '2026-03-03,-4.2'].join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    expect(result.validCount).toBe(2);
    expect(result.points.map((point) => point.yValue)).toEqual([0, -4.2]);
    expect(result.yRange).toEqual({ min: -4.2, max: 0 });
  });

  it('时间轴同样受展示上限保护，并统计未显示的记录数', () => {
    const rows = ['d,v'];
    for (let index = 0; index < LINE_DISPLAY_CAP + 3; index += 1) {
      const day = String((index % 28) + 1).padStart(2, '0');
      rows.push(`2026-03-${day},${index}`);
    }
    const table = tableOf(rows.join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    expect(result.rawTotal).toBe(LINE_DISPLAY_CAP + 3);
    expect(result.validCount).toBe(LINE_DISPLAY_CAP + 3);
    expect(result.displayedCount).toBe(LINE_DISPLAY_CAP);
    expect(result.capHidden).toBe(3);
    expect(result.cap).toBe(LINE_DISPLAY_CAP);
  });

  it('折线图不做插值：缺失的那天在数据里只有一个点，也不改变记录内容', () => {
    const table = tableOf(PLANT_CSV);
    const before = table.rows.map((row) => [...row]);
    const result = computeChartData(table, 'line', 1, 3);
    const byDate = new Map<number, number>();
    for (const point of result.points) byDate.set(point.xValue ?? 0, (byDate.get(point.xValue ?? 0) ?? 0) + 1);
    // 2026-03-03 只剩 treated 被缺失、control 也被缺失的那一天：两天各 2 条记录，其中缺失的不补点。
    expect(byDate.get(Date.UTC(2026, 2, 2))).toBe(2);
    expect(byDate.get(Date.UTC(2026, 2, 3))).toBe(1);
    expect(byDate.get(Date.UTC(2026, 2, 5))).toBe(1);
    expect(result.points.length).toBe(10);
    expect(table.rows).toEqual(before);
  });
});

describe('formatTimeTick：刻度文本按 UTC 生成', () => {
  it('零点只显示日期，含时分秒时显示到分钟', () => {
    expect(formatTimeTick(Date.UTC(2026, 2, 2))).toBe('2026-03-02');
    expect(formatTimeTick(Date.UTC(2026, 2, 2, 8, 15))).toBe('2026-03-02 08:15');
    expect(formatTimeTick(Date.UTC(2026, 11, 1, 23, 59, 59))).toBe('2026-12-01 23:59');
  });

  it('不可表示的时间戳返回空串，不输出 Invalid Date', () => {
    expect(formatTimeTick(Number.NaN)).toBe('');
    expect(formatTimeTick(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('toEChartsOption：折线图与聚合柱状图', () => {
  it('折线图用 line 系列、不平滑、不合并同日记录', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'line', 1, 3);
    const option = toEChartsOption(result, { xLabel: 'date', yLabel: 'height_cm' });
    const series = (option.series as Record<string, unknown>[])[0];
    expect(series.type).toBe('line');
    expect(series.smooth).toBe(false);
    expect(series.showSymbol).toBe(true);
    expect((series.data as unknown[][]).slice(0, 2)).toEqual([
      [Date.UTC(2026, 2, 2), 12.4],
      [Date.UTC(2026, 2, 2), 15.1],
    ]);
    const xAxis = option.xAxis as Record<string, unknown>;
    expect(xAxis.type).toBe('value');
  });

  it('折线图 tooltip 给出原始日期、原始数值与数据行号', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'line', 1, 3);
    const option = toEChartsOption(result, { xLabel: 'date', yLabel: 'height_cm' });
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    const html = tooltip.formatter({ dataIndex: 0 });
    expect(html).toContain('数据行号：1');
    expect(html).toContain('date：2026-03-02');
    expect(html).toContain('height_cm：12.4');
  });

  it('折线图刻度格式化器按 UTC 解释数值轴', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'line', 1, 3);
    const option = toEChartsOption(result, { xLabel: 'date', yLabel: 'height_cm' });
    const xAxis = option.xAxis as { axisLabel: { formatter: (value: string | number) => string } };
    expect(xAxis.axisLabel.formatter(Date.UTC(2026, 2, 4))).toBe('2026-03-04');
  });

  it('折线图刻度只落在整天上，不出现坐标轴算出的合成时刻', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'line', 1, 3);
    const option = toEChartsOption(result, { xLabel: 'date', yLabel: 'height_cm' });
    const xAxis = option.xAxis as {
      min: number;
      max: number;
      interval: number;
      axisLabel: { formatter: (value: string | number) => string };
    };
    expect(xAxis.min).toBe(Date.UTC(2026, 2, 2));
    expect(xAxis.max).toBe(Date.UTC(2026, 2, 7));

    const ticks: string[] = [];
    for (let value = xAxis.min; value <= xAxis.max; value += xAxis.interval) {
      expect(value % MS_PER_DAY).toBe(0);
      ticks.push(xAxis.axisLabel.formatter(value));
    }
    expect(ticks).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07']);
  });

  it('时间跨度接近一年时，刻度间隔按整天向上取整且仍只显示日期', () => {
    const iso = (ms: number) => {
      const date = new Date(ms);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    };
    const rows = ['d,v'];
    for (let offset = 0; offset <= 360; offset += 30) {
      rows.push(`${iso(Date.UTC(2025, 0, 1) + offset * MS_PER_DAY)},${offset}`);
    }
    const table = tableOf(rows.join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'd', yLabel: 'v' });
    const xAxis = option.xAxis as {
      min: number;
      max: number;
      interval: number;
      axisLabel: { formatter: (value: string | number) => string };
    };
    expect(xAxis.interval % MS_PER_DAY).toBe(0);
    const labels: string[] = [];
    for (let value = xAxis.min; value <= xAxis.max; value += xAxis.interval) {
      labels.push(xAxis.axisLabel.formatter(value));
    }
    expect(labels.length).toBeLessThanOrEqual(8);
    for (const label of labels) expect(label).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('只有一天观测时轴仍有宽度，刻度仍是对齐到整天的日期', () => {
    const table = tableOf(['d,v', '2026-03-02,1', '2026-03-02,2', '2026-03-02,3'].join('\n'));
    const result = computeChartData(table, 'line', 0, 1);
    const option = toEChartsOption(result, { xLabel: 'd', yLabel: 'v' });
    const xAxis = option.xAxis as { min: number; max: number; interval: number };
    expect(xAxis.min).toBe(Date.UTC(2026, 2, 2));
    expect(xAxis.max - xAxis.min).toBe(MS_PER_DAY);
    expect(xAxis.interval).toBe(MS_PER_DAY);
  });

  it('聚合柱状图 tooltip 说明类别、聚合方式、有效样本数与原始行号', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'mean');
    const option = toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm' });
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    const html = tooltip.formatter({ dataIndex: 1 });
    expect(html).toContain('类别：treated');
    expect(html).toContain('算术平均值');
    expect(html).toContain('有效样本数 n：5');
    expect(html).toContain('原始数据行号：2、6、8、10、12');
    expect(html).toContain('26.44');
    expect(html).not.toContain('误差棒');
  });

  it('求和模式 tooltip 明确标注求和口径与可加性提醒', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'sum');
    const option = toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm' });
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    expect(tooltip.formatter({ dataIndex: 0 })).toContain('求和');
  });

  it('坐标轴标注使用用户填写的标题与单位，tooltip 仍用字段名', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const option = toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm', xName: '处理组', yName: '株高（cm）' });
    expect((option.xAxis as Record<string, unknown>).name).toBe('处理组');
    expect((option.yAxis as Record<string, unknown>).name).toBe('株高（cm）');
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    expect(tooltip.formatter({ dataIndex: 0 })).toContain('类别：control');
  });

  it('轴标注缺省跟随字段名，长文本只做视觉缩略', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const option = toEChartsOption(result, { xLabel: 'group', yLabel: '一个很长很长的纵轴标题名称用来验证缩略效果是否按字符数截断' });
    const name = (option.yAxis as Record<string, unknown>).name as string;
    expect(name.length).toBeLessThanOrEqual(23);
    expect(name.endsWith('…')).toBe(true);
  });

  it('有轴标注时预留画布边距，空标注时不留下空白槽', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const withNames = optionGrid(toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm' }));
    const withoutNames = optionGrid(toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm', xName: '', yName: '' }));
    expect(withNames.left).toBe(48);
    expect(withoutNames.left).toBe(8);
    expect(withNames.bottom).toBeGreaterThan(withoutNames.bottom);
  });

  it('纵轴名躲开刻度文字：nameGap 留出小数刻度的宽度，避免轴名与刻度重叠', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const yAxis = (toEChartsOption(result, { xLabel: 'group', yLabel: 'height_cm' }) as { yAxis: Record<string, unknown> }).yAxis;
    // 浏览器实测：起点 95 时刻度形如 96.5，nameGap 26 会让旋转轴名压住刻度，故留出至少 40。
    expect(yAxis.nameGap).toBeGreaterThanOrEqual(40);
  });
});

function optionGrid(option: Record<string, unknown>): Record<string, number> {
  const grid = option.grid as Record<string, number>;
  return { left: grid.left, bottom: grid.bottom };
}

describe('日期字段候选与折线图可用性', () => {
  const table = tableOf(PLANT_CSV);
  const columnTypes = analyzeColumnTypes(table);

  it('date 列进入时间轴候选，类别轴候选不含日期列', () => {
    expect(dateFieldChoices(columnTypes).map((choice) => choice.index)).toEqual([1]);
    expect(categoryFieldChoices(columnTypes).map((choice) => choice.index)).toEqual([0, 2]);
    expect(fieldChoicesForAxis(columnTypes, 'line', 'x')).toEqual([{ index: 1, label: 'date' }]);
    expect(fieldChoicesForAxis(columnTypes, 'line', 'y').map((choice) => choice.index)).toEqual([3]);
  });

  it('默认选择把折线图落在首个日期字段与首个数值字段', () => {
    expect(defaultSelection(columnTypes, 'line')).toEqual({ x: 1, y: 3, ready: true });
  });

  it('柱状图切折线图时保留仍然合法的 Y 字段', () => {
    const fromBar = resolveFieldsForKind(columnTypes, 'line', { x: 2, y: 3 });
    expect(fromBar).toEqual({ x: 1, y: 3 });
    const fromScatter = resolveFieldsForKind(columnTypes, 'bar', { x: null, y: 3 });
    expect(fromScatter.y).toBe(3);
  });

  it('没有日期字段时折线图不可用并给出解释', () => {
    const noDate = analyzeColumnTypes(tableOf(['g,v,a', 'x,1,2', 'y,3,4'].join('\n')));
    const status = evaluateFieldAvailability(noDate, 'line');
    expect(status.ready).toBe(false);
    expect(status.xChoiceCount).toBe(0);
    expect(status.notice).toContain('没有可用作 X 轴的日期字段');
  });

  it('有日期但没有数值字段时说明缺少数值轴', () => {
    const noNumber = analyzeColumnTypes(tableOf(['d,g', '2026-03-02,a', '2026-03-03,b', '2026-03-04,c'].join('\n')));
    const status = evaluateFieldAvailability(noNumber, 'line');
    expect(status.ready).toBe(false);
    expect(status.notice).toContain('没有数值字段');
  });

  it('年月列被识别为日期字段，但逐条判定会排除精度不足的值', () => {
    const monthly = tableOf(['d,v', '2026-01,1', '2026-02,2', '2026-03,3'].join('\n'));
    const columnType = analyzeColumnTypes(monthly);
    expect(defaultSelection(columnType, 'line').ready).toBe(true);
    const result = computeChartData(monthly, 'line', 0, 1);
    expect(result.validCount).toBe(0);
    expect(result.excludedReasons.coarseDate).toBe(3);
  });
});

describe('summarizeChartScope：图表口径说明只复述真实统计', () => {
  it('逐条模式写明记录数、柱子数与未聚合', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const scope = summarizeChartScope(result, { ...CONTEXT, title: '柱状图：按 group 逐条展示 height_cm' });
    expect(scope.headline).toContain('原始记录 12 条');
    expect(scope.headline).toContain('符合条件的有效记录 10 条');
    expect(scope.headline).toContain('因缺失值排除 2 条');
    expect(scope.headline).toContain('本图实际展示 10 个数据点');
    expect(scope.headline).toContain('因类型不符或非有限数值排除 0 条');
    expect(scope.methodNotes.some((line) => line.includes('逐条原始记录展示，未进行分组求和'))).toBe(true);
    expect(scope.capNote).toBeNull();
    expect(scope.description.startsWith('柱状图，X 轴字段「group」，Y 轴字段「height_cm」')).toBe(true);
  });

  it('缺失与无效都按真实数字细分', () => {
    const table = tableOf(PLANT_CSV);
    const scope = summarizeChartScope(computeChartData(table, 'bar', 2, 3), CONTEXT);
    expect(scope.breakdown).toContain('缺失细分：空字符串 2 条、只有空白字符 0 条、结构性缺列 0 条。');
    expect(scope.breakdown.join('')).not.toContain('无效数值细分');
  });

  it('平均值模式说明分组规则、公式、n 与不生成统计结论', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'mean');
    const scope = summarizeChartScope(result, CONTEXT);
    expect(scope.headline).toContain('本图按类别聚合后实际绘制 2 根柱子');
    expect(scope.headline).toContain('类别组共 2 组');
    expect(scope.methodNotes.some((line) => line.includes('平均值 = 组内数值累加 ÷ 组内有效样本数 n'))).toBe(true);
    expect(scope.methodNotes.some((line) => line.includes('不生成误差棒、标准差、显著性标记'))).toBe(true);
    expect(scope.methodNotes.some((line) => line.includes('不删除、不修改、不合并任何原始记录'))).toBe(true);
    expect(scope.methodNotes.some((line) => line.includes('不会替你判断'))).toBe(false);
  });

  it('求和模式补充可加性提醒', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3, 'sum');
    const scope = summarizeChartScope(result, CONTEXT);
    expect(scope.methodNotes.some((line) => line.includes('求和只对该列本身可加的指标'))).toBe(true);
  });

  it('折线图说明 UTC 口径、不插值、同一天不合并', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'line', 1, 3);
    const scope = summarizeChartScope(result, { xLabel: 'date', yLabel: 'height_cm', title: '折线图：height_cm 随 date 的变化' });
    expect(scope.headline).toContain('本图实际展示 10 个数据点');
    expect(scope.methodNotes.some((line) => line.includes('不使用 Date.parse、也不读浏览器时区'))).toBe(true);
    expect(scope.methodNotes.some((line) => line.includes('不做插值、平滑、预测或趋势线'))).toBe(true);
    expect(scope.methodNotes.some((line) => line.includes('不求平均、不求和、不去重'))).toBe(true);
    expect(scope.methodNotes.some((line) => line.includes('绘图时间范围（UTC）：2026-03-02 – 2026-03-07'))).toBe(true);
    expect(scope.description.startsWith('折线图，X 轴字段「date」，Y 轴字段「height_cm」')).toBe(true);
  });

  it('年月与非法日期的排除数在口径里可见', () => {
    const table = tableOf(['d,v', '2026-03-02,1', '2026-03,2', '2026-02-30,3'].join('\n'));
    const scope = summarizeChartScope(computeChartData(table, 'line', 0, 1), {
      xLabel: 'd',
      yLabel: 'v',
      title: '折线图',
    });
    expect(scope.breakdown.some((line) => line.includes('日历上不存在的日期 1 条'))).toBe(true);
    expect(scope.breakdown.some((line) => line.includes('只到年月、精度不足以定位具体日期 1 条'))).toBe(true);
  });

  it('逐条模式触顶说明区分未显示记录与无效排除', () => {
    const rows = ['g,v'];
    for (let index = 0; index < 130; index += 1) rows.push(`g${index},${index}`);
    const table = tableOf(rows.join('\n'));
    const scope = summarizeChartScope(computeChartData(table, 'bar', 0, 1), CONTEXT);
    expect(scope.capNote).toContain('本图仅展示前 100 条');
    expect(scope.capNote).toContain('另有 30 条有效记录未显示');
    expect(scope.capNote).toContain('这不是无效被排除，只是单图展示上限');
  });

  it('聚合模式触顶说明分别给出组数与记录数', () => {
    const rows = ['g,v'];
    for (let index = 0; index < 120; index += 1) {
      rows.push(`c${index},${index}`);
      rows.push(`c${index},10`);
    }
    const table = tableOf(rows.join('\n'));
    const scope = summarizeChartScope(computeChartData(table, 'bar', 0, 1, 'mean'), CONTEXT);
    expect(scope.capNote).toContain('类别组共 120 组');
    expect(scope.capNote).toContain('另有 20 组（包含 40 条有效记录）没有成柱');
    expect(scope.capNote).toContain('不会被并进已显示的类别');
  });

  it('口径文本里的数字与统计结果一致，不出现未经计算的范围', () => {
    const table = tableOf(PLANT_CSV);
    const result = computeChartData(table, 'bar', 2, 3);
    const scope = summarizeChartScope(result, CONTEXT);
    expect(scope.methodNotes.some((line) => line.includes('进入图表的 Y 数值范围：-4.2 – 88.6'))).toBe(true);
    expect(scope.headline).not.toContain('异常值');
    expect(scope.methodNotes.join('')).not.toContain('可信度');
  });

  it('全部被排除时数值范围说明为无，而不是 0 – 0', () => {
    const table = tableOf(['g,v', 'a,x', 'b,y'].join('\n'));
    const result = computeChartData(table, 'bar', 0, 1);
    expect(result.yRange).toBeNull();
    const scope = summarizeChartScope(result, CONTEXT);
    expect(scope.methodNotes.join('')).not.toContain('进入图表的 Y 数值范围');
    expect(scope.headline).toContain('本图实际展示 0 个数据点');
  });
});
