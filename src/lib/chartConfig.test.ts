import { describe, expect, it } from 'vitest';

import {
  AGGREGATION_LABELS,
  MAX_AXIS_TITLE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_UNIT_LENGTH,
  chartTitleCarryOverNotice,
  computeTitleDefaults,
  composeAxisLabel,
  defaultChartConfig,
  diffChartConfig,
  emptyAxisConfig,
  reconcileConfigForContext,
  resetAxisAfterFieldChange,
  resolveChartTitles,
  sanitizeChartText,
  validateChartConfig,
} from './chartConfig';
import type { ChartConfig } from '../types/chart';

function configOf(patch: Partial<ChartConfig>): ChartConfig {
  return { ...defaultChartConfig(), ...patch };
}

const BAR_DEFAULTS = computeTitleDefaults('bar', { x: 'group', y: 'height_cm' }, 'raw');

describe('computeTitleDefaults：默认标题由图表类型与字段生成', () => {
  it('柱状图逐条模式的默认标题写明字段与逐条口径', () => {
    expect(BAR_DEFAULTS.title).toBe('柱状图：按 group 逐条展示 height_cm');
    expect(BAR_DEFAULTS.xTitle).toBe('group');
    expect(BAR_DEFAULTS.yTitle).toBe('height_cm');
  });

  it('平均值与求和模式在默认标题里写清聚合口径', () => {
    expect(computeTitleDefaults('bar', { x: 'group', y: 'height_cm' }, 'mean').title).toBe(
      '柱状图：按 group 计算 height_cm 平均值',
    );
    expect(computeTitleDefaults('bar', { x: 'group', y: 'height_cm' }, 'sum').title).toBe(
      '柱状图：按 group 计算 height_cm 求和',
    );
    expect(AGGREGATION_LABELS.raw).toBe('原始记录');
    expect(AGGREGATION_LABELS.mean).toBe('按类别平均值');
    expect(AGGREGATION_LABELS.sum).toBe('按类别求和');
  });

  it('散点图与折线图各有自己的默认标题形态', () => {
    expect(computeTitleDefaults('scatter', { x: 'weight', y: 'height' }, 'raw').title).toBe('散点图：weight 与 height 的关系');
    expect(computeTitleDefaults('line', { x: 'date', y: 'height_cm' }, 'raw').title).toBe('折线图：height_cm 随 date 的变化');
  });

  it('字段没选时明确写未选择，不编一个好看的标题', () => {
    expect(computeTitleDefaults('bar', { x: '', y: '' }, 'raw').title).toContain('（未选择字段）');
    expect(computeTitleDefaults('line', { x: '', y: '' }, 'raw').xTitle).toBe('（未选择字段）');
  });

  it('折线图即使传入聚合口径也只按时间序列命名', () => {
    expect(computeTitleDefaults('line', { x: 'date', y: 'value' }, 'mean').title).toBe('折线图：value 随 date 的变化');
  });

  it('默认标题保留字段原文，含 & 与 < 的表头不被改写成别的字符', () => {
    const defaults = computeTitleDefaults('bar', { x: 'A&B', y: '<b>tag</b>' }, 'raw');
    expect(defaults.xTitle).toBe('A&B');
    expect(defaults.yTitle).toBe('<b>tag</b>');
    expect(defaults.title).toContain('A&B');
  });
});

describe('resolveChartTitles：用户输入优先，未输入跟随默认', () => {
  it('未编辑时标题与轴标注全部跟随默认值，且不含任何猜测的单位', () => {
    const snapshot = resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS);
    expect(snapshot.title).toBe(BAR_DEFAULTS.title);
    expect(snapshot.xAxisLabel).toBe('group');
    expect(snapshot.yAxisLabel).toBe('height_cm');
    expect(snapshot.xUnit).toBe('');
    expect(snapshot.yAxisLabel).not.toContain('（');
  });

  it('用户编辑后的标题与轴标题生效', () => {
    const snapshot = resolveChartTitles(
      configOf({
        title: '三组盆栽株高',
        titleEdited: true,
        xAxis: { title: '处理组', titleEdited: true, unit: '' },
        yAxis: { title: '株高', titleEdited: true, unit: 'cm' },
      }),
      BAR_DEFAULTS,
    );
    expect(snapshot.title).toBe('三组盆栽株高');
    expect(snapshot.xAxisLabel).toBe('处理组');
    expect(snapshot.yAxisLabel).toBe('株高（cm）');
    expect(snapshot.yUnit).toBe('cm');
  });

  it('只填单位不改标题时标注是「字段名（单位）」', () => {
    const snapshot = resolveChartTitles(configOf({ yAxis: { title: '', titleEdited: false, unit: 'g' } }), BAR_DEFAULTS);
    expect(snapshot.yAxisLabel).toBe('height_cm（g）');
    expect(snapshot.yTitle).toBe('height_cm');
  });

  it('单位填 cm 只是标注：数值文本原样保留，不发生任何换算', () => {
    const snapshot = resolveChartTitles(configOf({ yAxis: { title: '12.40', titleEdited: true, unit: '0.001' } }), BAR_DEFAULTS);
    expect(snapshot.yTitle).toBe('12.40');
    expect(snapshot.yUnit).toBe('0.001');
  });

  it('手写但全为空白时退回默认值，不显示空标题', () => {
    expect(resolveChartTitles(configOf({ title: '   ', titleEdited: true }), BAR_DEFAULTS).title).toBe(BAR_DEFAULTS.title);
  });

  it('配置文本按各自上限缩略，不抛错也不清空', () => {
    const snapshot = resolveChartTitles(
      configOf({
        title: 'x'.repeat(MAX_TITLE_LENGTH + 30),
        titleEdited: true,
        xAxis: { title: 'y'.repeat(MAX_AXIS_TITLE_LENGTH + 10), titleEdited: true, unit: 'z'.repeat(MAX_UNIT_LENGTH + 5) },
      }),
      BAR_DEFAULTS,
    );
    expect(snapshot.title).toHaveLength(MAX_TITLE_LENGTH);
    expect(snapshot.xTitle).toHaveLength(MAX_AXIS_TITLE_LENGTH);
    expect(snapshot.xUnit).toHaveLength(MAX_UNIT_LENGTH);
  });

  it('composeAxisLabel 对空标题与空单位都不加多余括号', () => {
    expect(composeAxisLabel('株高', '')).toBe('株高');
    expect(composeAxisLabel('', 'cm')).toBe('cm');
    expect(composeAxisLabel('', '')).toBe('');
    expect(composeAxisLabel('株高', 'cm')).toBe('株高（cm）');
  });
});

describe('sanitizeChartText：只处理要显示的字符串', () => {
  it('控制字符换成空格并裁剪首尾空白', () => {
    expect(sanitizeChartText('  ab\tcd  ', 20)).toBe('ab cd');
    expect(sanitizeChartText('\u0000abc', 20)).toBe('abc');
  });

  it('纯空白输入变成长度 0，由调用方退回默认值', () => {
    expect(sanitizeChartText(' \t \n ', 20)).toBe('');
  });

  it('超限只截断显示文本，不改变前面已输入的字符', () => {
    const text = 'abcdefghij';
    expect(sanitizeChartText(text, 4)).toBe('abcd');
    expect(sanitizeChartText(text, 100)).toBe(text);
  });

  it('HTML 特殊字符原样保留（转义是渲染层的事，这里不吞字符）', () => {
    expect(sanitizeChartText('<script>alert(1)</script>', 60)).toBe('<script>alert(1)</script>');
    expect(sanitizeChartText('A&B "quoted" \'single\'', 60)).toBe('A&B "quoted" \'single\'');
  });
});

describe('resetAxisAfterFieldChange：更换字段后不套用旧标注', () => {
  it('旧轴有手写标题或单位时清空并说明原因', () => {
    const reset = resetAxisAfterFieldChange({ title: '株高', titleEdited: true, unit: 'cm' }, 'y');
    expect(reset.axis).toEqual(emptyAxisConfig());
    expect(reset.notices).toHaveLength(1);
    expect(reset.notices[0].message).toContain('Y 轴字段已更换');
    expect(reset.notices[0].message).toContain('株高');
    expect(reset.notices[0].message).toContain('cm');
  });

  it('只填了单位没有手写标题时也只提单位', () => {
    const reset = resetAxisAfterFieldChange({ title: '', titleEdited: false, unit: 'mg/L' }, 'x');
    expect(reset.axis.unit).toBe('');
    expect(reset.notices[0].message).toContain('X 轴字段已更换');
    expect(reset.notices[0].message).toContain('mg/L');
    expect(reset.notices[0].message).not.toContain('标题「');
  });

  it('什么都没填时不产生任何提示', () => {
    const reset = resetAxisAfterFieldChange(emptyAxisConfig(), 'x');
    expect(reset.notices).toHaveLength(0);
    expect(reset.axis).toEqual(emptyAxisConfig());
  });

  it('手写空白标题不算已有标注，不产生误导提示', () => {
    const reset = resetAxisAfterFieldChange({ title: '  ', titleEdited: true, unit: '' }, 'y');
    expect(reset.notices).toHaveLength(0);
  });
});

describe('reconcileConfigForContext：通用设置保留、不适用设置重置', () => {
  const edited = configOf({
    title: '我的标题',
    titleEdited: true,
    xAxis: { title: '处理组', titleEdited: true, unit: '类' },
    yAxis: { title: '株高', titleEdited: true, unit: 'cm' },
  });

  it('换 X 轴字段只重置 X 轴标注，Y 轴与图表标题保留', () => {
    const result = reconcileConfigForContext(edited, resolveChartTitles(edited, BAR_DEFAULTS), {
      xAxisFieldChanged: true,
      yAxisFieldChanged: false,
      defaultTitleChanged: false,
      aggregationDropped: false,
    });
    expect(result.config.xAxis).toEqual(emptyAxisConfig());
    expect(result.config.yAxis.unit).toBe('cm');
    expect(result.config.title).toBe('我的标题');
    expect(result.notices.map((notice) => notice.key)).toEqual(['x-axis-field-changed']);
  });

  it('手动标题不随字段变化被静默覆盖，但会给出说明', () => {
    const result = reconcileConfigForContext(edited, resolveChartTitles(edited, BAR_DEFAULTS), {
      xAxisFieldChanged: true,
      yAxisFieldChanged: true,
      defaultTitleChanged: true,
      aggregationDropped: false,
    });
    expect(result.config.title).toBe('我的标题');
    expect(result.config.titleEdited).toBe(true);
    expect(result.notices.some((notice) => notice.key === 'title-manual')).toBe(true);
    expect(result.notices.find((notice) => notice.key === 'title-manual')?.message).toContain('我的标题');
  });

  it('离开柱状图时聚合口径回到逐条原始记录并说明', () => {
    const result = reconcileConfigForContext(defaultChartConfig(), resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS), {
      xAxisFieldChanged: false,
      yAxisFieldChanged: false,
      defaultTitleChanged: true,
      aggregationDropped: true,
    });
    expect(result.notices.map((notice) => notice.key)).toContain('aggregation-dropped');
    expect(result.notices.find((notice) => notice.key === 'aggregation-dropped')?.message).toContain('只适用于柱状图');
  });

  it('自动标题跟随变化时不产生「手动标题」提示', () => {
    const result = reconcileConfigForContext(defaultChartConfig(), resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS), {
      xAxisFieldChanged: false,
      yAxisFieldChanged: false,
      defaultTitleChanged: true,
      aggregationDropped: false,
    });
    expect(result.notices).toHaveLength(0);
  });

  it('chartTitleCarryOverNotice 只在确实有手写标题时出现', () => {
    expect(chartTitleCarryOverNotice(defaultChartConfig(), resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS))).toBeNull();
    const notice = chartTitleCarryOverNotice(edited, resolveChartTitles(edited, BAR_DEFAULTS));
    expect(notice?.message).toContain('恢复自动标题');
  });
});

describe('validateChartConfig：无效配置说明原因而不阻断', () => {
  it('超长文本给出只显示前若干字的说明', () => {
    const config = configOf({ title: '长'.repeat(MAX_TITLE_LENGTH + 5), titleEdited: true });
    const notices = validateChartConfig(config, resolveChartTitles(config, BAR_DEFAULTS));
    expect(notices.some((notice) => notice.key === 'title-long')).toBe(true);
    expect(notices.find((notice) => notice.key === 'title-long')?.message).toContain(`${MAX_TITLE_LENGTH} 字`);
  });

  it('控制字符给出「已忽略」说明，并说明只影响标题', () => {
    const config = configOf({ title: 'a\u0007bc', titleEdited: true });
    const notices = validateChartConfig(config, resolveChartTitles(config, BAR_DEFAULTS));
    const control = notices.find((notice) => notice.key === 'title-control');
    expect(control?.message).toContain('1 个不可见控制字符');
    expect(control?.message).toContain('不改动数据');
  });

  it('只输入空格时按未填写处理并说明', () => {
    const config = configOf({ yAxis: { title: '   ', titleEdited: true, unit: '  ' } });
    const notices = validateChartConfig(config, resolveChartTitles(config, BAR_DEFAULTS));
    expect(notices.some((notice) => notice.key === 'yTitle-space')).toBe(true);
    expect(notices.some((notice) => notice.key === 'yUnit-space')).toBe(true);
  });

  it('只输入不可见字符时同样说明按未填写处理', () => {
    const config = configOf({ yAxis: { title: '  \u0001 ', titleEdited: true, unit: '' } });
    const notices = validateChartConfig(config, resolveChartTitles(config, BAR_DEFAULTS));
    expect(notices.some((notice) => notice.key === 'yTitle-blank')).toBe(true);
  });

  it('手写后又清空标题时说明会退回自动生成', () => {
    const config = configOf({ title: '', titleEdited: true });
    const notices = validateChartConfig(config, resolveChartTitles(config, BAR_DEFAULTS));
    expect(notices.some((notice) => notice.key === 'title-fallback')).toBe(true);
  });

  it('正常配置不产生任何提示', () => {
    const config = configOf({ yAxis: { title: '株高', titleEdited: true, unit: 'cm' } });
    expect(validateChartConfig(config, resolveChartTitles(config, BAR_DEFAULTS))).toHaveLength(0);
  });
});

describe('diffChartConfig：Day 7 修改前后对比所需的最小结构', () => {
  it('相同配置没有差异', () => {
    const before = resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS);
    expect(diffChartConfig(before, before)).toHaveLength(0);
  });

  it('只列出真实变化的项，并带上修改前后文本', () => {
    const before = resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS);
    const after = resolveChartTitles(
      configOf({ yAxis: { title: 'height_cm', titleEdited: true, unit: 'cm' } }),
      computeTitleDefaults('bar', { x: 'group', y: 'height_cm' }, 'mean'),
    );
    const changes = diffChartConfig(before, after);
    expect(changes.map((change) => change.key).sort()).toEqual(['title', 'yUnit']);
    expect(changes.find((change) => change.key === 'yUnit')).toEqual({ key: 'yUnit', label: 'Y 轴单位', before: '', after: 'cm' });
    expect(changes.find((change) => change.key === 'title')?.after).toBe('柱状图：按 group 计算 height_cm 平均值');
  });

  it('合成后的轴标注变化能反映单位差异', () => {
    const before = resolveChartTitles(defaultChartConfig(), BAR_DEFAULTS);
    const after = resolveChartTitles(configOf({ yAxis: { title: '', titleEdited: false, unit: 'mm' } }), BAR_DEFAULTS);
    expect(diffChartConfig(before, after).map((change) => change.key)).toEqual(['yUnit']);
    expect(after.yAxisLabel).toBe('height_cm（mm）');
  });

  it('配置对象之间互不共享引用：改一份不会串到另一份', () => {
    const first = defaultChartConfig();
    const second = defaultChartConfig();
    first.yAxis.unit = 'cm';
    expect(second.yAxis.unit).toBe('');
    expect(second.xAxis).not.toBe(first.xAxis);
  });
});
