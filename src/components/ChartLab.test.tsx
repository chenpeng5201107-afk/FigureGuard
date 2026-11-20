// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartLab } from './ChartLab';
import { parseCsvText } from '../lib/csv';
import type { CsvTable } from '../types/csv';

// 用假的 ECharts 替换真实模块：jsdom 没有 Canvas，重点验证容器生命周期与界面行为。
const echartsMock = vi.hoisted(() => {
  const instances: Array<{
    /** init 收到的容器节点：Day 8 画面里同时存在主图与两张对比图，按节点定位实例。 */
    el: unknown;
    setOption: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getZr: ReturnType<typeof vi.fn>;
    getDataURL: ReturnType<typeof vi.fn>;
  }> = [];
  /** Day 9：getDataURL 的返回值可按测试改写（空串代表 ECharts 没给出图像数据）。 */
  const pngState = { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' };
  const init = vi.fn((el: unknown) => {
    const instance = {
      el,
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      getZr: vi.fn(() => ({ flush: vi.fn() })),
      getDataURL: vi.fn(() => pngState.dataUrl),
    };
    instances.push(instance);
    return instance;
  });
  const use = vi.fn();
  return { init, use, instances, pngState };
});

vi.mock('../lib/echartsCore', () => ({
  echarts: { init: echartsMock.init, use: echartsMock.use },
}));

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

const MULTINUM_CSV = [
  'grp,a,b,c',
  'p,1,10,100',
  'q,2,20,200',
  'r,,30,300',
  's,abc,40,400',
  't,5,,500',
].join('\n');

function tableOf(text: string, fileName = 'lab.csv'): CsvTable {
  const outcome = parseCsvText(text, { fileName, source: 'file' });
  if (outcome.status !== 'ok') throw new Error(`测试数据解析失败：${outcome.error.message}`);
  return outcome.table;
}

function selectX(): HTMLSelectElement {
  return screen.getByLabelText('X 轴字段') as HTMLSelectElement;
}
function selectY(): HTMLSelectElement {
  return screen.getByLabelText('Y 轴字段') as HTMLSelectElement;
}
function chartTypePressed(label: string): string | null {
  return (screen.getByRole('button', { name: label }) as HTMLButtonElement).getAttribute('aria-pressed');
}
function statsScope(): ReturnType<typeof within> {
  return within(screen.getByTestId('chart-stats'));
}

/** Day 9：Blob 下载在 jsdom 里没有实现，改成记录被点击的临时 `<a>`；同时留下 Blob 本体供报告正文断言。 */
const downloadStub = vi.hoisted(() => ({ anchors: [] as HTMLAnchorElement[], blobs: [] as Blob[] }));
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
const nativeCreateObjectURL = URL.createObjectURL;
const nativeRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  echartsMock.init.mockClear();
  echartsMock.instances.length = 0;
  echartsMock.pngState.dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  downloadStub.anchors.length = 0;
  downloadStub.blobs.length = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    downloadStub.blobs.push(blob);
    return 'blob:figureguard/stub';
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
    downloadStub.anchors.push(this);
  }) as unknown as typeof HTMLAnchorElement.prototype.click;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  HTMLAnchorElement.prototype.click = nativeAnchorClick;
  URL.createObjectURL = nativeCreateObjectURL;
  URL.revokeObjectURL = nativeRevokeObjectURL;
});

describe('图表实验室：默认选择与柱状图（植物示例）', () => {
  it('默认柱状图自动选中 X=group、Y=height_cm 并统计 12/10/2', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);

    expect(screen.getByRole('heading', { name: '图表实验室' })).toBeTruthy();
    expect(selectX().value).toBe('2');
    expect(selectY().value).toBe('3');
    expect(statsScope().getByText(/符合条件的有效记录 10 条/)).toBeTruthy();
    expect(statsScope().getByText(/因缺失值排除 2 条/)).toBeTruthy();
    // 明确说明逐条原始记录、未分组聚合。
    expect(statsScope().getByText(/逐条原始记录展示，未进行分组求和/)).toBeTruthy();
  });

  it('有有效数据时初始化一次 ECharts 实例并 setOption', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);

    expect(screen.getByTestId('echarts-canvas')).toBeTruthy();
    expect(echartsMock.init).toHaveBeenCalledTimes(1);
    expect(echartsMock.instances[0].setOption).toHaveBeenCalledTimes(1);
  });

  it('图表带 role=img 无障碍标题与读屏文字说明', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);

    expect(screen.getByRole('img', { name: '柱状图预览' })).toBeTruthy();
    expect(screen.getByText(/柱状图，X 轴字段「group」，Y 轴字段「height_cm」/)).toBeTruthy();
  });

  it('保留 88.6 与 -4.2：Y 轴不锁定 0 起点且不删除极端值', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);

    const option = echartsMock.instances[0].setOption.mock.calls[0][0] as {
      yAxis: { min?: number; scale?: boolean };
      series: Array<{ data: number[] }>;
    };
    // 不锁定 0 起点：既没有固定 min，也不会 scale:false 之外强行裁剪负值。
    expect(option.yAxis.min).toBeUndefined();
    const ys = option.series[0].data;
    expect(ys).toContain(88.6);
    expect(ys).toContain(-4.2);
  });
});

describe('图表实验室：图表类型与字段切换', () => {
  it('切到散点图时，仅一个数值字段的植物数据给出需要两个数值字段的空状态', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);

    fireEvent.click(screen.getByRole('button', { name: '散点图' }));

    expect(screen.getByText(/散点图需要两个不同的数值字段/)).toBeTruthy();
    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
    expect(selectX().disabled).toBe(true);
    expect(selectY().disabled).toBe(true);
  });

  it('两个数值字段可绘制散点图并按缺失/类型分别计数', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV)} />);

    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    // 默认落在前两个数值字段 a、b。
    expect(selectX().value).toBe('1');
    expect(selectY().value).toBe('2');
    expect(screen.getByTestId('echarts-canvas')).toBeTruthy();
    expect(statsScope().getByText(/符合条件的有效记录 2 条/)).toBeTruthy();
    expect(statsScope().getByText(/因缺失值排除 2 条/)).toBeTruthy();
    expect(statsScope().getByText(/因类型不符或非有限数值排除 1 条/)).toBeTruthy();
  });

  it('切换 Y 字段后按新字段重算，实例不重建但 option 更新', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV)} />);
    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    // 柱状图与散点图各自创建一个实例，切换后保留当前（最后一个）实例。
    const instancesAfterSwitch = echartsMock.instances.length;
    const scatterInstance = echartsMock.instances[instancesAfterSwitch - 1];
    const scatterSetOptionBefore = scatterInstance.setOption.mock.calls.length;

    fireEvent.change(selectY(), { target: { value: '3' } });

    // 只更新 option，不再新建实例。
    expect(echartsMock.instances.length).toBe(instancesAfterSwitch);
    expect(scatterInstance.setOption.mock.calls.length).toBe(scatterSetOptionBefore + 1);
    expect(statsScope().getByText(/符合条件的有效记录 3 条/)).toBeTruthy();
  });

  it('散点图 X 与 Y 选同一字段时拒绝成对绘制', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV)} />);
    fireEvent.click(screen.getByRole('button', { name: '散点图' }));

    fireEvent.change(selectY(), { target: { value: '1' } });

    expect(screen.getByText(/散点图的 X 与 Y 必须选择两个不同的数值字段/)).toBeTruthy();
    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
  });

  it('全为不可用数值时给出全部排除的空状态而不是空图表', () => {
    render(<ChartLab table={tableOf('g,v\na,1e999\nb,1e999\nc,1e999')} />);

    expect(screen.getByText(/所有记录都因缺失或类型不符被排除/)).toBeTruthy();
    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
  });
});

describe('图表实验室：上限提示、状态重置与实例清理', () => {
  it('超过单图上限时显著提示前 N 条与未显示条数', () => {
    const rows = ['g,v'];
    for (let i = 0; i < 130; i += 1) rows.push(`${i % 2 === 0 ? 'control' : 'treated'},${i + 1}`);
    render(<ChartLab table={tableOf(rows.join('\n'))} />);

    expect(screen.getByText(/本图仅展示前 100 条/)).toBeTruthy();
    expect(screen.getByText(/另有 30 条有效记录未显示/)).toBeTruthy();
  });

  it('换一份 CSV 时回到柱状图默认选择、清空上一份字段状态', () => {
    const { rerender } = render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    // 先切散点图并改字段，制造一份「脏」状态。
    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    expect(chartTypePressed('散点图')).toBe('true');

    rerender(<ChartLab table={tableOf(MULTINUM_CSV, 'other.csv')} />);

    // 新文件重新按柱状图默认：X=grp(0)、Y=a(1)。
    expect(chartTypePressed('柱状图')).toBe('true');
    expect(selectX().value).toBe('0');
    expect(selectY().value).toBe('1');
  });

  it('解析错误 / 结构降级的文件阻止生成正式图表', () => {
    render(<ChartLab table={tableOf('a,b,c\n1,2,3\n4,5')} />);

    expect(screen.getByTestId('chart-blocked')).toBeTruthy();
    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
    expect(echartsMock.init).not.toHaveBeenCalled();
  });

  it('只有表头、没有数据行时给出空状态', () => {
    render(<ChartLab table={tableOf('a,b,c\n')} />);

    expect(screen.getByTestId('chart-empty')).toBeTruthy();
    expect(screen.getByText(/文件里只有表头、没有数据行/)).toBeTruthy();
    expect(echartsMock.init).not.toHaveBeenCalled();
  });

  it('卸载时释放 ECharts 实例', () => {
    const { unmount } = render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    expect(echartsMock.instances[0].dispose).not.toHaveBeenCalled();

    unmount();

    expect(echartsMock.instances[0].dispose).toHaveBeenCalledTimes(1);
  });
});

// ===== Day 7：柱状图 Y 轴起点与非零基线表达风险诊断 =====

const BASELINE_CSV = ['group,value', 'A,96', 'B,98', 'C,97'].join('\n');

function yMinOfChart(): number | undefined {
  const yAxis = chartOption().yAxis as Record<string, unknown>;
  return yAxis.min as number | undefined;
}
function diagStatus(): string {
  return screen.getByTestId('diagnostic-status').textContent ?? '';
}
function diagText(): string {
  return screen.getByTestId('chart-diagnostics').textContent ?? '';
}
function setStartManual(value: string): void {
  fireEvent.click(screen.getByLabelText('手动设置'));
  fireEvent.change(screen.getByTestId('yaxis-start-input'), { target: { value } });
}
function setStartAuto(): void {
  fireEvent.click(screen.getByLabelText('自动（含零基线）'));
}

describe('图表实验室 Day 7：非零基线检测、证据与实时联动', () => {
  it('默认自动模式：纵轴不固定起点、诊断为未发现风险，检测依据与实际坐标轴一致', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    expect(yMinOfChart()).toBeUndefined();
    expect(seriesData()).toEqual([96, 98, 97]);
    expect(diagStatus()).toContain('未发现风险');
    expect(diagText()).toContain('当前图表未发现本次规则覆盖的表达风险');
    expect(diagText()).toContain('不能代表图表或科研结论完全正确');
  });

  it('手动把起点设为 95：出现非零基线风险，真实 ECharts min 同步为 95，数值仍是 96/98', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    setStartManual('95');

    expect(yMinOfChart()).toBe(95);
    expect(seriesData()).toEqual([96, 98, 97]);
    expect(diagStatus()).toContain('建议核查');
    expect(diagText()).toContain('柱状图非零基线');
    expect(diagText()).toContain('不包含 0');
    expect(diagText()).toContain('96 – 98');
    expect(diagText()).toContain('放大');
    expect(diagText()).toContain('零基线');
    expect(screen.getByTestId('yaxis-start-applied').textContent).toContain('95');
  });

  it('把起点从 95 改回 0：风险消失，min 落到 0', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    expect(diagStatus()).toContain('建议核查');

    fireEvent.change(screen.getByTestId('yaxis-start-input'), { target: { value: '0' } });

    expect(yMinOfChart()).toBe(0);
    expect(diagStatus()).toContain('未发现风险');
  });

  it('改回自动：坐标轴取消固定起点，风险消失', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');

    setStartAuto();

    expect(yMinOfChart()).toBeUndefined();
    expect(diagStatus()).toContain('未发现风险');
    expect(screen.queryByTestId('yaxis-start-input')).toBeNull();
  });

  it('起点 99 不低于最大值 98：配置无效、阻止应用，图表退回自动且不谎报风险', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('99');

    expect(yMinOfChart()).toBeUndefined();
    expect(seriesData()).toEqual([96, 98, 97]);
    expect(screen.getByTestId('yaxis-start-error').textContent).toContain('98');
    expect(diagStatus()).toContain('配置无效');
    expect(diagText()).not.toContain('柱状图非零基线');
  });

  it('非法输入 abc：明确报错，绝不把非数值写进坐标轴', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('abc');

    expect(yMinOfChart()).toBeUndefined();
    expect(screen.getByTestId('yaxis-start-error')).toBeTruthy();
    expect(diagStatus()).toContain('配置无效');
  });

  it('合法负数柱状图（数据含负值、自动模式）不报非零基线', () => {
    render(<ChartLab table={tableOf('g,v\na,-5\nb,3\nc,7', 'neg.csv')} />);

    expect(diagStatus()).toContain('未发现风险');
    expect(yMinOfChart()).toBeUndefined();
  });

  it('切换到散点图：柱状图规则不适用，面板明确说明而非谎报通过', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV, 'multi.csv')} />);
    setStartManual('95');

    fireEvent.click(screen.getByRole('button', { name: '散点图' }));

    expect(screen.queryByTestId('yaxis-start-config')).toBeNull();
    expect(diagStatus()).toContain('不适用');
    expect(diagText()).toContain('当前图表类型不适用柱状图零基线检查');
    expect(diagText()).toContain('不代表图表或科研结论已经通过全部检查');
  });

  it('切换到折线图：同样不适用柱状图零基线规则', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);

    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(diagStatus()).toContain('不适用');
  });

  it('更换 CSV 后清空旧诊断：回到自动默认，不再残留上一个文件的起点', () => {
    const { rerender } = render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    expect(diagStatus()).toContain('建议核查');

    rerender(<ChartLab table={tableOf(MULTINUM_CSV, 'other.csv')} />);

    expect(screen.queryByTestId('yaxis-start-input')).toBeNull();
    expect(yMinOfChart()).toBeUndefined();
    expect(diagStatus()).toContain('未发现风险');
  });

  it('严重解析错误阻止正式绘图与诊断：不出现诊断面板', () => {
    render(<ChartLab table={tableOf('a,b,c\n1,2,3\n4,5', 'broken.csv')} />);

    expect(screen.getByTestId('chart-blocked')).toBeTruthy();
    expect(screen.queryByTestId('chart-diagnostics')).toBeNull();
  });

  it('聚合柱状图按真实聚合结果判断：平均值口径 + 起点抬到均值附近仍依据真实 yRange', () => {
    // 分组后 A、B 各一条，聚合值即 96、98；手动起点 95 应基于真实聚合范围报风险。
    render(<ChartLab table={tableOf('group,value\nA,96\nA,96\nB,98\nB,98', 'agg.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));

    expect(seriesData()).toEqual([96, 98]);
    setStartManual('95');

    expect(diagStatus()).toContain('建议核查');
    expect(diagText()).toContain('96 – 98');
  });
});

// ===== Day 7 整改：纵轴起点部分裁剪保护（起点高于数据最小值一律不应用） =====

const NEG_MIX_CSV = ['group,value', 'A,-5', 'B,20', 'C,10'].join('\n');
const AGG_CROP_CSV = ['group,value', 'A,10', 'A,90', 'B,80'].join('\n');

function startErrorText(): string {
  return screen.getByTestId('yaxis-start-error').textContent ?? '';
}
function startNoticeText(): string {
  return screen.getByTestId('yaxis-start-notice').textContent ?? '';
}
function yAxisOptionKeys(): string[] {
  return Object.keys(chartOption().yAxis as Record<string, unknown>);
}

describe('图表实验室 Day 7 整改：部分裁剪保护', () => {
  it('数据 96–98、起点 97：低于起点的 96 会被裁掉，阻止应用并说明原因', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('97');

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('高于数据最小值 96');
    expect(diagStatus()).toContain('配置无效');
    expect(diagStatus()).not.toContain('未发现风险');
  });

  it('阻止裁剪只改坐标轴：数据点、原始记录与有效记录计数一律不变', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    const statsBefore = statsText();

    setStartManual('97');

    expect(seriesData()).toEqual([96, 98, 97]);
    expect(statsText()).toBe(statsBefore);
    expect(statsText()).toContain('符合条件的有效记录 3 条');
  });

  it('数据 96–98、起点 95（低于最小值）仍然合法：min 落到 95 并照旧报非零基线风险', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');

    expect(yMinOfChart()).toBe(95);
    expect(screen.queryByTestId('yaxis-start-error')).toBeNull();
    expect(diagStatus()).toContain('建议核查');
  });

  it('数据 96–98、起点 99：继续按不低于最大值阻止', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('99');

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('不低于数据最大值 98');
  });

  it('数据 -5–20、起点 -1：负数被裁掉，阻止且不说成正常', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('-1');

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('高于数据最小值 -5');
    expect(diagStatus()).toContain('配置无效');
  });

  it('数据 -5–20、起点 0：包含零基线也不能隐藏负数', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('0');

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('高于数据最小值 -5');
    expect(startErrorText()).toContain('起点设成 0');
    expect(diagStatus()).toContain('配置无效');
    expect(seriesData()).toEqual([-5, 20, 10]);
  });

  it('数据 -5–20、起点 -10：合法应用，数值完整且含零基线 → 未发现风险', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('-10');

    expect(yMinOfChart()).toBe(-10);
    expect(diagStatus()).toContain('未发现风险');
    expect(diagText()).toContain('纵轴起点为 -10');
    expect(diagText()).not.toContain('柱状图非零基线');
  });

  it('起点恰好等于数据最小值：应用但如实说明柱子退化成零长度，不说成完整可辨', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('-5');

    expect(yMinOfChart()).toBe(-5);
    expect(screen.queryByTestId('yaxis-start-error')).toBeNull();
    expect(startNoticeText()).toContain('长度 0');
    expect(startNoticeText()).toContain('不能算已经完整可辨');
  });

  it('起点低于最小值时不出现代价提示：合法配置不被说成有问题', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('-6');

    expect(yMinOfChart()).toBe(-6);
    expect(screen.queryByTestId('yaxis-start-notice')).toBeNull();
  });

  it('植物示例（含 -4.2）把起点设为 0：阻止隐藏负数，且不误报正常', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    setStartManual('0');

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('-4.2');
    expect(diagStatus()).toContain('配置无效');
    const ys = seriesData() as number[];
    expect(ys).toContain(-4.2);
    expect(ys).toContain(88.6);
  });

  it('植物示例起点 -4.2（等于最小值）：应用后自动范围仍包含负值与零', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    setStartManual('-4.2');

    expect(yMinOfChart()).toBe(-4.2);
    expect(yAxisOptionKeys()).toContain('min');
    expect((chartOption().yAxis as Record<string, unknown>).scale).toBe(false);
  });

  it('自动模式对含负值的数据不固定下界：min 缺省、由坐标轴容纳负值与零', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);

    expect('min' in (chartOption().yAxis as Record<string, unknown>)).toBe(false);
    expect(diagStatus()).toContain('未发现风险');
    expect(seriesData()).toEqual([-5, 20, 10]);
  });

  it('配置从合法改成裁剪：ECharts 不沿用旧下界（option 无 min 且按 notMerge 覆盖）', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    expect(yMinOfChart()).toBe(95);

    setStartManual('97');

    expect('min' in (chartOption().yAxis as Record<string, unknown>)).toBe(false);
    const calls = echartsMock.instances[echartsMock.instances.length - 1].setOption.mock.calls;
    expect(calls[calls.length - 1][1]).toBe(true);
  });

  it('更换 Y 字段后重新校验：起点 25 对 100–500 合法，换成 10–40 的字段即变成裁剪', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV, 'multi.csv')} />);
    fireEvent.change(selectY(), { target: { value: '3' } });
    setStartManual('25');

    expect(yMinOfChart()).toBe(25);
    expect(diagStatus()).toContain('建议核查');

    fireEvent.change(selectY(), { target: { value: '2' } });

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('高于数据最小值 10');
    expect(diagStatus()).toContain('配置无效');
  });

  it('更换聚合口径后重新校验：起点 30 在逐条口径下裁剪，在平均值口径下合法', () => {
    render(<ChartLab table={tableOf(AGG_CROP_CSV, 'agg-crop.csv')} />);
    setStartManual('30');

    expect(yMinOfChart()).toBeUndefined();
    expect(startErrorText()).toContain('高于数据最小值 10');
    expect(diagStatus()).toContain('配置无效');

    fireEvent.click(screen.getByLabelText('按类别平均值'));

    // A 组平均 50、B 组 80：最小值升到 50，起点 30 不再裁剪任何数值。
    expect(seriesData()).toEqual([50, 80]);
    expect(yMinOfChart()).toBe(30);
    expect(diagStatus()).toContain('建议核查');
  });

  it('起点高于最小值时不改动源数据：字段与类型切换后数值仍原样', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('0');

    fireEvent.click(screen.getByLabelText('按类别求和'));

    expect(seriesData()).toEqual([-5, 20, 10]);
    expect(statsText()).toContain('原始记录 3 条');
  });
});

// ===== Day 6：图表配置、分类聚合与时间序列折线图 =====

function chartOption(): Record<string, unknown> {
  const instances = echartsMock.instances;
  const last = instances[instances.length - 1];
  const calls = last.setOption.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}
function seriesData(): unknown[] {
  const series = (chartOption().series as Record<string, unknown>[]) ?? [];
  return (series[0]?.data as unknown[]) ?? [];
}
function axisName(axis: 'x' | 'y'): string {
  const part = chartOption()[`${axis}Axis`] as Record<string, unknown>;
  return (part.name as string) ?? '';
}
function tooltipHtml(index: number): string {
  const tooltip = chartOption().tooltip as { formatter: (params: unknown) => string };
  return tooltip.formatter({ dataIndex: index });
}
function chartTitle(): string {
  return screen.getByTestId('chart-title').textContent ?? '';
}
function inputOf(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}
function typeInto(label: string, value: string): void {
  fireEvent.change(inputOf(label), { target: { value } });
}
function noticeText(): string {
  const box = screen.queryByTestId('chart-notices');
  return box ? (box.textContent ?? '') : '';
}
function statsText(): string {
  return screen.getByTestId('chart-stats').textContent ?? '';
}

describe('图表实验室 Day 6：标题、轴标题与单位配置', () => {
  it('默认标题由图表类型与字段生成并显示在图表上方', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    expect(chartTitle()).toBe('柱状图：按 group 逐条展示 height_cm');
  });

  it('改成平均值口径后默认标题写明聚合方式', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    expect(chartTitle()).toBe('柱状图：按 group 计算 height_cm 平均值');
  });

  it('手动改标题后图表同步更新且不重建实例', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    const instancesBefore = echartsMock.instances.length;
    typeInto('图表标题', '盆栽株高初步观察');

    expect(chartTitle()).toBe('盆栽株高初步观察');
    expect(echartsMock.instances.length).toBe(instancesBefore);
    expect(echartsMock.instances[instancesBefore - 1].setOption.mock.calls.length).toBeGreaterThan(1);
  });

  it('轴标题与单位合成为坐标轴标注，字段名仍是 tooltip 的键', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    typeInto('Y 轴标题', '株高');
    typeInto('Y 轴单位（可选）', 'cm');
    typeInto('X 轴标题', '处理组');

    expect(axisName('y')).toBe('株高（cm）');
    expect(axisName('x')).toBe('处理组');
    expect(tooltipHtml(0)).toContain('类别：control');
    expect(tooltipHtml(0)).toContain('数值：12.4');
  });

  it('单位留空时不猜测，页面明确说明未填写', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    expect(axisName('y')).toBe('height_cm');
    expect(screen.getAllByText(/未填写单位/).length).toBeGreaterThan(0);
  });

  it('单位填 cm 只是标注，数值不发生任何换算', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    typeInto('Y 轴单位（可选）', 'cm');
    const values = seriesData() as number[];
    expect(values).toContain(12.4);
    expect(values).toContain(88.6);
    expect(values).toContain(-4.2);
    expect(values).toHaveLength(10);
  });

  it('手写标题在切换类型后保留并说明，恢复自动标题后跟随新字段', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    typeInto('图表标题', '我的观察图');
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(chartTitle()).toBe('我的观察图');
    expect(noticeText()).toContain('仍是你手动填写的');

    fireEvent.click(screen.getByRole('button', { name: '恢复自动标题' }));
    expect(chartTitle()).toBe('折线图：height_cm 随 date 的变化');
    expect(inputOf('图表标题').value).toBe('');
  });

  it('更换 Y 轴字段后旧轴标题与单位被清空并说明原因', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV)} />);
    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    typeInto('Y 轴标题', '重量');
    typeInto('Y 轴单位（可选）', 'kg');

    fireEvent.change(selectY(), { target: { value: '3' } });

    expect(axisName('y')).toBe('c');
    expect(inputOf('Y 轴标题').value).toBe('');
    expect(inputOf('Y 轴单位（可选）').value).toBe('');
    expect(noticeText()).toContain('Y 轴字段已更换');
    expect(noticeText()).toContain('重量');
  });

  it('超长标题只缩略显示、给出说明且输入框保留全文', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    const long = '长'.repeat(130);
    typeInto('图表标题', long);

    expect(chartTitle().length).toBe(120);
    expect(inputOf('图表标题').value).toBe(long);
    expect(noticeText()).toContain('超过 120 字');
  });

  it('标题里的 HTML 片段按纯文本显示，不会被解析成元素', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    typeInto('图表标题', '<img src=x onerror=alert(1)>');
    typeInto('Y 轴单位（可选）', '<b>cm</b>');

    expect(chartTitle()).toBe('<img src=x onerror=alert(1)>');
    expect(screen.getByTestId('chart-title').querySelector('img')).toBeNull();
    expect(document.querySelector('#chart-preview img')).toBeNull();
    expect(axisName('y')).toContain('<b>cm</b>');
  });

  it('只填空格或控制字符时说明按未填写处理，图表不崩溃', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    typeInto('图表标题', '   ');
    expect(chartTitle()).toBe('柱状图：按 group 逐条展示 height_cm');
    expect(noticeText()).toContain('只输入了空格');
    expect(screen.getByTestId('echarts-canvas')).toBeTruthy();

    typeInto('图表标题', `a${String.fromCharCode(1)}b`);
    expect(noticeText()).toContain('不可见控制字符');
    expect(chartTitle()).toBe('a b');
  });

  it('更换 CSV 后标题、单位与聚合配置一起重置', () => {
    const { rerender } = render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    typeInto('图表标题', '旧文件的标题');
    typeInto('Y 轴单位（可选）', 'cm');
    fireEvent.click(screen.getByLabelText('按类别平均值'));

    rerender(<ChartLab table={tableOf(MULTINUM_CSV, 'other.csv')} />);

    expect(inputOf('图表标题').value).toBe('');
    expect(inputOf('Y 轴单位（可选）').value).toBe('');
    expect((screen.getByLabelText('原始记录') as HTMLInputElement).checked).toBe(true);
    expect(chartTitle()).toBe('柱状图：按 grp 逐条展示 a');
    expect(noticeText()).toBe('');
  });

  it('配置只改表达、不改数据：换标题后统计数字保持不变', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    const before = statsText();
    typeInto('图表标题', '随便一个标题');
    typeInto('Y 轴标题', '株高');
    expect(statsText()).toBe(before);
    expect(before).toContain('符合条件的有效记录 10 条');
  });
});

describe('图表实验室 Day 6：分类聚合方式', () => {
  it('默认逐条模式保持 Day 5 行为并说明未聚合', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    expect((screen.getByLabelText('原始记录') as HTMLInputElement).checked).toBe(true);
    expect(seriesData()).toHaveLength(10);
    expect(statsText()).toContain('逐条原始记录展示，未进行分组求和');
  });

  it('平均值模式一个类别一根柱子，并列出各组 n 与原始行号', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));

    expect(seriesData()).toHaveLength(2);
    expect((seriesData() as number[])[0]).toBeCloseTo(13.14, 10);
    expect((seriesData() as number[])[1]).toBeCloseTo(26.44, 10);
    expect(statsText()).toContain('本图按类别聚合后实际绘制 2 根柱子');
    expect(statsText()).toContain('符合条件的有效记录 10 条');
    expect(statsText()).toContain('平均值 = 组内数值累加 ÷ 组内有效样本数 n');
    expect(statsText()).toContain('n = 5');
    expect(statsText()).toContain('13.14');
    expect(statsText()).toContain('26.44');
    expect(statsText()).toContain('行号 2、6、8、10、12');
  });

  it('聚合模式的 tooltip 说明类别、方式、n 与原始行号', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    const html = tooltipHtml(1);
    expect(html).toContain('类别：treated');
    expect(html).toContain('算术平均值');
    expect(html).toContain('有效样本数 n：5');
    expect(html).toContain('原始数据行号：2、6、8、10、12');
  });

  it('缺失记录不进入平均值分母：n 仍是 5 而不是 6', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    expect(statsText()).toContain('因缺失值排除 2 条');
    expect(statsText()).not.toContain('n = 6');
  });

  it('求和模式给出结果并提醒只有可加指标才适合求和', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别求和'));

    expect((seriesData() as number[])[0]).toBeCloseTo(65.7, 10);
    expect((seriesData() as number[])[1]).toBeCloseTo(132.2, 10);
    expect(statsText()).toContain('求和只对该列本身可加的指标');
    expect(chartTitle()).toBe('柱状图：按 group 计算 height_cm 求和');
  });

  it('切换聚合口径只更新 option，不重建实例', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    const instancesBefore = echartsMock.instances.length;
    const callsBefore = echartsMock.instances[instancesBefore - 1].setOption.mock.calls.length;

    fireEvent.click(screen.getByLabelText('按类别平均值'));

    expect(echartsMock.instances.length).toBe(instancesBefore);
    expect(echartsMock.instances[instancesBefore - 1].setOption.mock.calls.length).toBe(callsBefore + 1);
  });

  it('散点图与折线图不显示类别聚合控件', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    expect(screen.queryByLabelText('按类别平均值')).toBeNull();
    expect(screen.queryByText('分类聚合方式')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    expect(screen.queryByLabelText('按类别求和')).toBeNull();
  });

  it('离开柱状图时聚合口径回到逐条记录并说明', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    expect(noticeText()).toContain('聚合方式只适用于柱状图的类别轴');
    fireEvent.click(screen.getByRole('button', { name: '柱状图' }));
    expect((screen.getByLabelText('原始记录') as HTMLInputElement).checked).toBe(true);
  });

  const OVERFLOW_CSV = ['group,value', 'a,1e308', 'a,1e308', 'b,2', 'b,3'].join('\n');

  it('求和溢出：明确标注不可计算，不画这根柱子，也不把 Infinity 传进图表', () => {
    render(<ChartLab table={tableOf(OVERFLOW_CSV, 'overflow.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别求和'));

    expect(seriesData()).toEqual([5]);
    const note = screen.getByTestId('chart-overflow-note').textContent ?? '';
    expect(note).toContain('1 个类别组（共 2 条记录）的聚合结果');
    expect(note).toContain('没有被算进「类型不符排除」');
    expect(statsText()).toContain('合计无法有限表示');
    expect(statsText()).toContain('n = 2');
    expect(statsText()).toContain('行号 1、2');
    expect(statsText()).toContain('符合条件的有效记录 4 条');
    expect(statsText()).toContain('因类型不符或非有限数值排除 0 条');
  });

  it('同一份数据改用平均值口径：1e308 的平均值照样画出来，没有不可计算提示', () => {
    render(<ChartLab table={tableOf(OVERFLOW_CSV, 'overflow.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));

    expect(seriesData()).toEqual([1e308, 2.5]);
    expect(screen.queryByTestId('chart-overflow-note')).toBeNull();
    expect(statsText()).toContain('1e+308');
  });
});

describe('图表实验室 Day 6：时间序列折线图', () => {
  it('切到折线图自动选 date 与 height_cm 并绘制 line 系列', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(selectX().value).toBe('1');
    expect(selectY().value).toBe('3');
    const series = (chartOption().series as Record<string, unknown>[])[0];
    expect(series.type).toBe('line');
    expect(series.smooth).toBe(false);
    expect(seriesData()).toHaveLength(10);
    expect((seriesData() as unknown[][])[0][0]).toBe(Date.UTC(2026, 2, 2));
  });

  it('折线图 X 轴提示写明「年在前」，与实际接受的写法一致', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    const hint = screen.getByText(/折线图 X 轴使用日期字段/).textContent ?? '';
    expect(hint).toContain('年在前');
    expect(hint).not.toContain('年在后');
  });

  it('折线图说明 10 条观测参与、2 条缺失未参与，并交代不插值与 UTC 口径', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    const text = statsText();
    expect(text).toContain('符合条件的有效记录 10 条');
    expect(text).toContain('因缺失值排除 2 条');
    expect(text).toContain('本图实际展示 10 个数据点');
    expect(text).toContain('不使用 Date.parse、也不读浏览器时区');
    expect(text).toContain('不做插值、平滑、预测或趋势线');
    expect(text).toContain('不求平均、不求和、不去重');
    expect(text).toContain('绘图时间范围（UTC）：2026-03-02 – 2026-03-07');
  });

  it('折线图 tooltip 给出数据行号、原始日期与原始数值', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    const html = tooltipHtml(5);
    expect(html).toContain('数据行号：8');
    expect(html).toContain('date：2026-03-05');
    expect(html).toContain('height_cm：16.8');
  });

  it('X 轴刻度按 UTC 输出日期文本', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    const xAxis = chartOption().xAxis as { axisLabel: { formatter: (value: string | number) => string } };
    expect(xAxis.axisLabel.formatter(Date.UTC(2026, 2, 7))).toBe('2026-03-07');
  });

  it('只有年月的列被明确说明为精度不足，不补成某月第一天', () => {
    const monthly = ['d,v', '2026-01,1', '2026-02,2', '2026-03,3'].join('\n');
    render(<ChartLab table={tableOf(monthly)} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
    expect(screen.getByTestId('chart-empty').textContent).toContain('被排除');
    expect(statsText()).toContain('只到年月、精度不足以定位具体日期 3 条');
  });

  it('日历上不存在的日期不进入绘图并计入无效排除', () => {
    const rows = ['d,v', '2026-03-02,1', '2026-02-30,2', '2026-03-03,3', '2026-03-04,4'].join('\n');
    render(<ChartLab table={tableOf(rows)} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(seriesData()).toHaveLength(3);
    expect(statsText()).toContain('因类型不符或非有限数值排除 1 条');
    expect(statsText()).toContain('日历上不存在的日期 1 条');
  });

  it('没有日期字段时给出可解释的空状态', () => {
    render(<ChartLab table={tableOf(['g,v', 'a,1', 'b,2', 'c,3'].join('\n'))} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(screen.getByTestId('chart-empty').textContent).toContain('没有可用作 X 轴的日期字段');
    expect(screen.queryByTestId('echarts-canvas')).toBeNull();
    expect(selectX().disabled).toBe(true);
  });

  it('同一天多条记录全部画出，不按天合并', () => {
    const rows = ['d,v', '2026-03-02,1', '2026-03-02,2', '2026-03-02,3', '2026-03-03,4'].join('\n');
    render(<ChartLab table={tableOf(rows)} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    const data = seriesData() as number[][];
    expect(data).toHaveLength(4);
    expect(data.filter((pair) => pair[0] === Date.UTC(2026, 2, 2))).toHaveLength(3);
  });

  it('折线图超出展示上限时给出未显示记录数', () => {
    const rows = ['d,v'];
    for (let index = 0; index < 2100; index += 1) {
      const day = String((index % 28) + 1).padStart(2, '0');
      rows.push(`2026-03-${day},${index}`);
    }
    render(<ChartLab table={tableOf(rows.join('\n'))} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));

    expect(seriesData()).toHaveLength(2000);
    expect(statsText()).toContain('符合条件的有效记录 2,100 条');
    expect(statsText()).toContain('本图仅展示前 2,000 条');
    expect(statsText()).toContain('另有 100 条有效记录未显示');
  });
});

describe('内置植物示例的三体验（Day 6 验收）', () => {
  it('体验一：原始柱状图 10 根柱子并声明未聚合', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    expect(seriesData()).toHaveLength(10);
    expect(statsText()).toContain('未进行分组求和');
    expect((seriesData() as number[])).toContain(88.6);
    expect((seriesData() as number[])).toContain(-4.2);
  });

  it('体验二：平均值柱状图给出 control 13.14 与 treated 26.44 及各组 n', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    const text = statsText();
    expect(text).toContain('control');
    expect(text).toContain('treated');
    expect(text).toContain('13.14');
    expect(text).toContain('26.44');
    expect(text).toContain('n = 5');
    expect(text).toContain('平均值 = 组内数值累加 ÷ 组内有效样本数 n');
  });

  it('体验三：折线图按日期展示 10 条有效观测并说明 2 条缺失未参与', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    expect(seriesData()).toHaveLength(10);
    expect(statsText()).toContain('因缺失值排除 2 条');
    expect(statsText()).toContain('缺失细分：空字符串 2 条');
  });

  it('三种模式的图表说明都不给异常值判断、可信度评分等未经计算的结论', () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    const negation = '不生成误差棒、标准差、显著性标记';
    const texts = ['', '', ''];
    texts[0] = `${statsText()} ${noticeText()}`;
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    texts[1] = `${statsText()} ${noticeText()}`;
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    texts[2] = `${statsText()} ${noticeText()}`;

    // 只允许“不生成 / 不做 / 不提供”这类否定句提到这些概念；肯定句里不能出现未经计算的结论。
    const affirmative = (text: string) => text.split(/[；;。]/).filter((part) => !part.includes('不')).join(' ');
    const forbidden = /异常值|离群|IQR|可信度|评分|置信区间|预测|趋势线|误差棒|标准差|显著性/;
    for (const [index, text] of texts.entries()) {
      expect(`${index}:${affirmative(text)}`).not.toMatch(forbidden);
    }
    expect(texts[0]).not.toMatch(/误差棒|标准差|显著性/);
    expect(texts[2]).not.toMatch(/误差棒|标准差|显著性/);
    expect(texts[1]).toContain(negation);
    expect(texts[1].replace(negation, '')).not.toMatch(/误差棒|标准差|显著性/);
  });
});

// ===== Day 8：一键修复、真实前后对比与单步撤销 =====

const MAIN_CHART = '柱状图预览';
const BEFORE_CHART = '修复前柱状图预览';
const AFTER_CHART = '修复后柱状图预览';

/** 画面里可能同时存在三个实例：按容器节点定位，不看「最后一个」。 */
function instanceOfChart(name: string) {
  const node = screen.getByRole('img', { name });
  const instance = echartsMock.instances.find((item) => item.el === node);
  if (!instance) throw new Error(`未找到「${name}」对应的 ECharts 实例`);
  return instance;
}
function optionOfChart(name: string): Record<string, unknown> {
  const calls = instanceOfChart(name).setOption.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}
function yAxisOf(name: string): Record<string, unknown> {
  return optionOfChart(name).yAxis as Record<string, unknown>;
}
function yMinOf(name: string): number | undefined {
  return yAxisOf(name).min as number | undefined;
}
function dataOf(name: string): unknown[] {
  const series = (optionOfChart(name).series as Array<{ data: unknown[] }>) ?? [];
  return series[0]?.data ?? [];
}
function categoriesOf(name: string): unknown[] {
  const xAxis = optionOfChart(name).xAxis as { data?: unknown[] };
  return xAxis.data ?? [];
}
function tooltipOf(name: string, index: number): string {
  const tooltip = optionOfChart(name).tooltip as { formatter: (params: unknown) => string };
  return tooltip.formatter({ dataIndex: index });
}
function setRiskStart(): void {
  render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
  setStartManual('95');
}
function repair(): void {
  fireEvent.click(screen.getByTestId('repair-baseline'));
}
function undo(): void {
  fireEvent.click(screen.getByTestId('repair-undo'));
}
function repairNote(): string {
  const node = screen.queryByTestId('chart-repair-note');
  return node ? (node.textContent ?? '') : '';
}

describe('图表实验室 Day 8 A 组：修复入口只在真实风险下出现', () => {
  it('起点 95 判为非零基线风险时给出「一键恢复零基线」，依据带上真实下界', () => {
    setRiskStart();

    const button = screen.getByTestId('repair-baseline') as HTMLButtonElement;
    expect(button.textContent).toBe('一键恢复零基线');
    expect(button.type).toBe('button');
    expect(diagStatus()).toContain('建议核查');
    expect(button.closest('[data-testid="chart-diagnostics"]')).toBeTruthy();
    expect(diagText()).toContain('95');
  });

  it('自动模式没有风险，不提供没有意义的修复入口', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    expect(screen.queryByTestId('repair-baseline')).toBeNull();
    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
  });

  it('起点 0 已含零基线：诊断为未发现风险，也没有修复入口', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('0');

    expect(diagStatus()).toContain('未发现风险');
    expect(screen.queryByTestId('repair-baseline')).toBeNull();
  });

  it('起点 97 会被裁剪：配置无效、起点没生效，绝不给出会宣称修复成功的入口', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('97');

    expect(diagStatus()).toContain('配置无效');
    expect(yMinOf(MAIN_CHART)).toBeUndefined();
    expect(screen.queryByTestId('repair-baseline')).toBeNull();
  });

  it('输入框里有正数但解析失败（abc）时同样没有修复入口', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('abc');

    expect(screen.queryByTestId('repair-baseline')).toBeNull();
  });

  it('散点图不适用本条规则：只回答不适用，也不给柱状图修复入口', () => {
    render(<ChartLab table={tableOf(MULTINUM_CSV, 'multinum.csv')} />);
    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    fireEvent.change(selectX(), { target: { value: '1' } });
    fireEvent.change(selectY(), { target: { value: '2' } });

    expect(diagStatus()).toContain('不适用');
    expect(screen.queryByTestId('repair-baseline')).toBeNull();
    // 纵轴起点控件本身只对柱状图开放，散点图不会被这条规则越界判断。
    expect(screen.queryByTestId('yaxis-start-input')).toBeNull();
  });

  it('Y 字段没有可绘制数值时不出现修复入口，也不留下对比区', () => {
    render(<ChartLab table={tableOf('group,value\nA,\nB,\nC,', 'empty.csv')} />);
    setStartManual('95');

    expect(screen.queryByTestId('repair-baseline')).toBeNull();
    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
  });

  it('解析被阻止的文件同时阻断诊断与修复：连图表表达检查面板都不出现', () => {
    render(<ChartLab table={tableOf('a,b,c\n1,2,3\n4,5', 'broken.csv')} />);

    expect(screen.getByTestId('chart-blocked')).toBeTruthy();
    expect(screen.queryByTestId('chart-diagnostics')).toBeNull();
    expect(screen.queryByTestId('repair-baseline')).toBeNull();
  });
});

describe('图表实验室 Day 8 B 组：点击修复真的改写配置并重算', () => {
  it('修复后主图纵轴不再携带旧的 95，起点回到自动模式，诊断重新计算为未发现风险', () => {
    setRiskStart();
    repair();

    expect(yMinOf(MAIN_CHART)).toBeUndefined();
    expect(dataOf(MAIN_CHART)).toEqual([96, 98, 97]);
    expect((screen.getByLabelText('自动（含零基线）') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByTestId('yaxis-start-input')).toBeNull();
    expect(diagStatus()).toContain('未发现风险');
    expect(diagText()).toContain('包含 0');
  });

  it('修复成功提示用 role=status 播报，并声明原始数据未改动', () => {
    setRiskStart();
    repair();

    const done = screen.getByTestId('repair-done');
    expect(done.getAttribute('role')).toBe('status');
    expect(done.textContent).toContain('已恢复包含零基线的自动纵轴范围');
    expect(done.textContent).toContain('原始实验数据未发生变化');
  });

  it('修复只动配置：记录数、数值与聚合口径保持原样', () => {
    setRiskStart();
    const before = statsText();
    repair();

    expect(statsText()).toBe(before);
    expect(statsText()).toContain('符合条件的有效记录 3 条');
    expect(dataOf(MAIN_CHART)).toEqual([96, 98, 97]);
  });

  it('修复后不再出现第二个修复入口，也不会叠加第二条记录', () => {
    setRiskStart();
    repair();

    expect(screen.queryByTestId('repair-baseline')).toBeNull();
    expect(echartsMock.instances).toHaveLength(3);
  });

  it('措辞不越界：不说科研错误已修复、不说图表完全正确、不说结论更可信', () => {
    setRiskStart();
    repair();

    const text = `${(screen.getByTestId('chart-repair-comparison').textContent ?? '')} ${repairNote()}`;
    expect(text).not.toMatch(/科研错误|造假|完全正确|更可信/);
    expect(text).toContain('图表配置');
  });
});

describe('图表实验室 Day 8 C 组：两个真实 ECharts 的前后对比', () => {
  it('对比区是独立初始化、独立更新的两张图：修复前保留 95，修复后不带 min', () => {
    setRiskStart();
    repair();

    expect(echartsMock.instances).toHaveLength(3);
    expect(yMinOf(BEFORE_CHART)).toBe(95);
    expect('min' in yAxisOf(AFTER_CHART)).toBe(false);
    expect(yAxisOf(AFTER_CHART).scale).toBe(false);
    expect(instanceOfChart(BEFORE_CHART)).not.toBe(instanceOfChart(AFTER_CHART));
    expect(instanceOfChart(BEFORE_CHART)).not.toBe(instanceOfChart(MAIN_CHART));
  });

  it('两张图共用同一份数据：数值、类别顺序与悬浮提示逐条一致', () => {
    setRiskStart();
    repair();

    expect(dataOf(BEFORE_CHART)).toEqual([96, 98, 97]);
    expect(dataOf(AFTER_CHART)).toEqual(dataOf(BEFORE_CHART));
    expect(categoriesOf(AFTER_CHART)).toEqual(categoriesOf(BEFORE_CHART));
    expect(tooltipOf(AFTER_CHART, 0)).toBe(tooltipOf(BEFORE_CHART, 0));
    expect(tooltipOf(BEFORE_CHART, 0)).toContain('96');
    expect(tooltipOf(BEFORE_CHART, 0)).toContain('数据行号');
  });

  it('对比两侧画布高度一致，差异只来自坐标轴配置，不用 CSS 高度造假', () => {
    setRiskStart();
    repair();

    const heights = [BEFORE_CHART, AFTER_CHART].map((name) => (screen.getByRole('img', { name }) as HTMLElement).style.height);
    expect(heights[0]).toBe('320px');
    expect(heights[1]).toBe(heights[0]);
  });

  it('对比说明与「本次修复修改了什么？」都由记录拼出，数字来自真实下界', () => {
    setRiskStart();
    repair();

    expect(screen.getByTestId('repair-compare-note').textContent).toContain('修复前的纵轴下界为 95');
    const changes = screen.getByTestId('repair-changes').textContent ?? '';
    expect(changes).toContain('本次修复修改了什么？');
    expect(changes).toContain('检测规则');
    expect(changes).toContain('手动 95 → 自动范围');
    expect(changes).toContain('不等于实际刻度下界恰好为 0');
    expect(changes).toContain('原始记录 3 条');
  });

  it('重新检查一行来自真实重算的诊断，而不是强制写成通过', () => {
    setRiskStart();
    repair();

    expect(screen.getByTestId('repair-after-status').textContent).toContain('未发现风险');
    expect(screen.getByTestId('repair-changes').textContent).toContain('重新检查');
  });

  it('改标题会让旧对比过期清除，并说明原因；绘图数值不受影响', () => {
    setRiskStart();
    repair();
    typeInto('图表标题', '修复后又改的标题');

    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
    expect(repairNote()).toContain('修复前后对比已清除');
    expect(repairNote()).toContain('标题或单位');
    expect(dataOf(MAIN_CHART)).toEqual([96, 98, 97]);
  });

  it('修复后再手动改起点同样过期，并点名 Y 轴起点', () => {
    setRiskStart();
    repair();
    setStartManual('90');

    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
    expect(repairNote()).toContain('Y 轴起点');
  });

  it('换一份 CSV 后旧对比消失并说明属于另一份数据', () => {
    const { rerender } = render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    repair();

    rerender(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);

    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
    expect(repairNote()).toContain('数据文件');
    expect(screen.queryByTestId('repair-baseline')).toBeNull();
  });

  it('同名 CSV 重新加载也算新数据，旧记录不会串联', () => {
    const { rerender } = render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    repair();

    rerender(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
    expect(repairNote()).toContain('数据文件');
  });

  it('切换聚合方式后对比过期，绘图数值随之重算', () => {
    render(<ChartLab table={tableOf(AGG_CROP_CSV, 'agg-crop.csv')} />);
    setStartManual('10');
    repair();
    fireEvent.click(screen.getByLabelText('按类别平均值'));

    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
    expect(repairNote()).toContain('聚合');
    expect(dataOf(MAIN_CHART)).toEqual([50, 80]);
  });
});

describe('图表实验室 Day 8 D 组：单步撤销', () => {
  it('撤销恢复修复前的手动起点，真实刻度回到 95，风险由重算重新出现', () => {
    setRiskStart();
    repair();
    undo();

    expect(yMinOf(MAIN_CHART)).toBe(95);
    expect((screen.getByLabelText('手动设置') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('yaxis-start-input') as HTMLInputElement).value).toBe('95');
    expect(diagStatus()).toContain('建议核查');
    expect(diagText()).toContain('柱状图非零基线');
  });

  it('撤销后清除旧对比、给出说明，且不留下可点的撤销按钮', () => {
    setRiskStart();
    repair();
    undo();

    expect(screen.queryByTestId('chart-repair-comparison')).toBeNull();
    expect(screen.queryByTestId('repair-undo')).toBeNull();
    expect(repairNote()).toContain('已撤销本次修复');
    expect(repairNote()).toContain('95');
  });

  it('撤销之后可以再次修复，形成完整闭环', () => {
    setRiskStart();
    repair();
    undo();

    repair();

    expect(screen.getByTestId('chart-repair-comparison')).toBeTruthy();
    expect(yMinOf(MAIN_CHART)).toBeUndefined();
    expect(diagStatus()).toContain('未发现风险');
  });

  it('没有修复记录时不显示撤销按钮', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    expect(screen.queryByTestId('repair-undo')).toBeNull();

    setStartManual('95');

    expect(screen.queryByTestId('repair-undo')).toBeNull();
  });

  it('撤销只释放两张对比图的实例，主图实例继续存活', () => {
    setRiskStart();
    repair();
    const before = instanceOfChart(BEFORE_CHART);
    const after = instanceOfChart(AFTER_CHART);
    const main = instanceOfChart(MAIN_CHART);

    undo();

    expect(before.dispose).toHaveBeenCalledTimes(1);
    expect(after.dispose).toHaveBeenCalledTimes(1);
    expect(main.dispose).not.toHaveBeenCalled();
  });

  it('撤销不改数据：记录数与数值和修复前完全一致', () => {
    setRiskStart();
    const stats = statsText();
    repair();
    undo();

    expect(statsText()).toBe(stats);
    expect(dataOf(MAIN_CHART)).toEqual([96, 98, 97]);
  });
});

describe('图表实验室 Day 8 E 组：边界与回归', () => {
  it('含负值的数据不会进入可修复状态，负值也照常可见', () => {
    render(<ChartLab table={tableOf(NEG_MIX_CSV, 'neg-mix.csv')} />);
    setStartManual('95');

    expect(screen.queryByTestId('repair-baseline')).toBeNull();
    expect(diagStatus()).toContain('配置无效');
    expect(dataOf(MAIN_CHART)).toContain(-5);
  });

  it('聚合柱状图按真实聚合值修复：前后都画聚合后的平均值，差异只在纵轴', () => {
    render(<ChartLab table={tableOf(AGG_CROP_CSV, 'agg-crop.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));
    setStartManual('10');
    repair();

    expect(dataOf(BEFORE_CHART)).toEqual([50, 80]);
    expect(dataOf(AFTER_CHART)).toEqual([50, 80]);
    expect(yMinOf(BEFORE_CHART)).toBe(10);
    expect(yMinOf(AFTER_CHART)).toBeUndefined();
  });

  it('修复不影响展示上限：130 条记录仍只绘制 100 个展示单元', () => {
    const rows = ['g,v'];
    for (let i = 0; i < 130; i += 1) rows.push(`c${i},${i + 100}`);
    render(<ChartLab table={tableOf(rows.join('\n'), 'many.csv')} />);
    setStartManual('100');
    repair();

    expect(dataOf(BEFORE_CHART)).toHaveLength(100);
    expect(dataOf(AFTER_CHART)).toHaveLength(100);
    expect(screen.getAllByText(/本图仅展示前 100 条/).length).toBeGreaterThanOrEqual(1);
  });

  it('修复不改变标题、轴标题与单位：只有纵轴起点被改写', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    typeInto('Y 轴标题', '株高');
    typeInto('Y 轴单位（可选）', 'cm');
    setStartManual('95');
    const yName = yAxisOf(MAIN_CHART).name as string;
    repair();

    expect(yAxisOf(MAIN_CHART).name).toBe(yName);
    expect(yAxisOf(AFTER_CHART).name).toBe(yName);
    expect((screen.getByLabelText('Y 轴标题') as HTMLInputElement).value).toBe('株高');
    expect((screen.getByLabelText('Y 轴单位（可选）') as HTMLInputElement).value).toBe('cm');
  });

  it('Day 7 裁剪保护仍在：起点 97 不写进坐标轴、数值不被隐藏', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('97');

    expect(yMinOf(MAIN_CHART)).toBeUndefined();
    expect(dataOf(MAIN_CHART)).toEqual([96, 98, 97]);
    expect(diagStatus()).toContain('配置无效');
  });

  it('修复流程不干扰既有读屏说明与诊断免责文案', () => {
    setRiskStart();
    const label = screen.getByRole('img', { name: MAIN_CHART }).getAttribute('aria-label');
    repair();

    expect(screen.getByRole('img', { name: MAIN_CHART }).getAttribute('aria-label')).toBe(label);
    expect(diagText()).toContain('不能代表图表或科研结论完全正确');
  });

  it('卸载时释放全部三个实例，不泄漏 ECharts 资源', () => {
    setRiskStart();
    repair();
    const instances = [...echartsMock.instances];

    cleanup();

    for (const instance of instances) expect(instance.dispose).toHaveBeenCalledTimes(1);
  });
});

// ===== Day 9：PNG 图表导出与 Markdown 报告 =====

function pngButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '导出当前图表 PNG' }) as HTMLButtonElement;
}
function reportButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '导出 Markdown 报告' }) as HTMLButtonElement;
}
function feedbackText(): string {
  const node = screen.queryByTestId('export-feedback');
  return node ? (node.textContent ?? '') : '';
}
function pngReason(): string {
  const node = screen.queryByTestId('export-png-reason');
  return node ? (node.textContent ?? '') : '';
}
function captionText(): string {
  const node = screen.queryByTestId('export-target');
  return node ? (node.textContent ?? '') : '';
}
function downloads(): HTMLAnchorElement[] {
  return downloadStub.anchors;
}

/** 点击导出 PNG：等离屏实例真的取过图并销毁，返回那一个实例。 */
async function exportPng() {
  const before = echartsMock.instances.length;
  fireEvent.click(pngButton());
  await waitFor(() => expect(echartsMock.instances.length).toBeGreaterThan(before));
  const instance = echartsMock.instances[before]!;
  await waitFor(() => expect(instance.dispose).toHaveBeenCalled());
  return instance;
}

describe('图表实验室 Day 9 A 组：按钮可用性只认真实画面状态', () => {
  it('正常柱状图：两个导出按钮都可用，说明文字点明导出的是哪张图', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    expect(pngButton().disabled).toBe(false);
    expect(reportButton().disabled).toBe(false);
    expect(captionText()).toContain('柱状图');
    expect(captionText()).toContain('「group」');
    expect(captionText()).toContain('「value」');
    expect(captionText()).toContain('实际绘制 3 个数据点');
  });

  it('解析被阻止的数据：PNG 禁用并说明原因，报告仍可导出非正式结论', () => {
    render(<ChartLab table={tableOf('a,b,c\n1,2\n3,4,5', 'broken.csv')} />);

    expect(screen.getByTestId('chart-blocked')).toBeTruthy();
    expect(pngButton().disabled).toBe(true);
    expect(pngReason()).toContain('数据质量准入未通过');
    expect(reportButton().disabled).toBe(false);
    expect(captionText()).toContain('PNG 已禁用');
  });

  it('没有可用数值字段：图表画不出来，PNG 给出原因而不是静默禁用', () => {
    render(<ChartLab table={tableOf('name,city\n甲,乙\n丙,丁', 'text-only.csv')} />);

    expect(screen.getByTestId('chart-empty')).toBeTruthy();
    expect(pngButton().disabled).toBe(true);
    expect(pngReason()).toContain('还没有可导出的图表');
    expect(reportButton().disabled).toBe(false);
  });

  it('字段下全部记录被排除、没有可绘制点：PNG 禁用并提示改用报告留证', () => {
    // 数值形态但非有限（1e999 → Infinity）：字段合法、记录全被排除，画布上没有图形。
    render(<ChartLab table={tableOf('g,v\n甲,1e999\n乙,-1e999\n丙,1e999', 'no-point.csv')} />);

    expect(screen.getByTestId('chart-empty').textContent).toContain('所有记录都因缺失或类型不符被排除');
    expect(pngButton().disabled).toBe(true);
    expect(pngReason()).toContain('当前选择下没有可绘制的数据点');
    expect(pngReason()).toContain('Markdown 报告仍会如实记录');
    expect(reportButton().disabled).toBe(false);
  });

  it('只有表头没有数据行：仍然提供报告，但不提供空图表的 PNG', () => {
    render(<ChartLab table={tableOf('sample,value', 'header-only.csv')} />);

    expect(screen.getByTestId('chart-empty')).toBeTruthy();
    expect(pngButton().disabled).toBe(true);
    expect(reportButton().disabled).toBe(false);
  });
});

describe('图表实验室 Day 9 B 组：PNG 内容与屏幕完全同源', () => {
  it('柱状图：导出实例拿到屏幕同一份数据、白底、关动画与画布内标题', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    const screenData = dataOf(MAIN_CHART);
    const instance = await exportPng();

    const option = instance.setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((option.series as Array<{ data: unknown[] }>)[0]?.data).toEqual(screenData);
    expect((option.xAxis as { data: unknown[] }).data).toEqual(categoriesOf(MAIN_CHART));
    expect(option.animation).toBe(false);
    expect(option.backgroundColor).toBe('#ffffff');
    expect((option.title as { text: string }).text).toBe(screen.getByTestId('chart-title').textContent);
  });

  it('手动起点 95 生效时：PNG 的 yAxis.min 与屏幕一致', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    expect(yMinOf(MAIN_CHART)).toBe(95);

    const option = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((option.yAxis as Record<string, unknown>).min).toBe(95);
  });

  it('标题、轴标题与单位改完再导出：PNG 用的是改后的那一份', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    fireEvent.change(screen.getByLabelText('图表标题'), { target: { value: '三组实测值对比' } });
    fireEvent.change(screen.getByLabelText('Y 轴标题'), { target: { value: '响应值' } });
    fireEvent.change(screen.getByLabelText('Y 轴单位（可选）'), { target: { value: 'uV' } });

    const option = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((option.title as { text: string }).text).toBe('三组实测值对比');
    expect((option.yAxis as { name: string }).name).toContain('响应值');
    expect((option.yAxis as { name: string }).name).toContain('uV');
    expect(captionText()).toContain('三组实测值对比');
  });

  it('聚合方式改变后导出：PNG 与屏幕用的是同一份聚合结果', async () => {
    render(<ChartLab table={tableOf(PLANT_CSV, 'plant-growth.csv')} />);
    fireEvent.click(screen.getByLabelText('按类别平均值'));

    const option = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((option.xAxis as { data: unknown[] }).data).toEqual(categoriesOf(MAIN_CHART));
    expect((option.xAxis as { data: unknown[] }).data).toEqual(['control', 'treated']);
    expect((option.series as Array<{ data: unknown[] }>)[0]?.data).toEqual(dataOf(MAIN_CHART));
  });

  it('散点图与折线图同样可导出：series 类型与坐标轴口径与屏幕一致', async () => {
    // 日期 + 两个数值字段：散点图需要两个数值轴，折线图需要日期 X 轴。
    const csv = ['day,dose,response', '2026-03-02,1,2.5', '2026-03-03,2,4.5', '2026-03-04,3,7.2', '2026-03-05,4,9.1'].join('\n');
    render(<ChartLab table={tableOf(csv, 'dose-response.csv')} />);

    fireEvent.click(screen.getByRole('button', { name: '散点图' }));
    fireEvent.change(selectX(), { target: { value: '1' } });
    fireEvent.change(selectY(), { target: { value: '2' } });
    await waitFor(() => expect(pngButton().disabled).toBe(false));
    const scatterName = '散点图预览';
    const scatterScreen = optionOfChart(scatterName);
    const scatterOption = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((scatterOption.series as Array<{ type: string }>)[0]?.type).toBe('scatter');
    expect(scatterOption.series).toEqual(scatterScreen.series);
    expect((scatterOption.xAxis as { min?: number }).min).toEqual((scatterScreen.xAxis as { min?: number }).min);

    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    fireEvent.change(selectX(), { target: { value: '0' } });
    fireEvent.change(selectY(), { target: { value: '2' } });
    await waitFor(() => expect(pngButton().disabled).toBe(false));
    const lineName = '折线图预览';
    const lineScreen = optionOfChart(lineName);
    const lineOption = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((lineOption.series as Array<{ type: string }>)[0]?.type).toBe('line');
    expect(lineOption.series).toEqual(lineScreen.series);
    // 折线图沿用按天对齐的 UTC 数值时间轴：刻度范围与格式化器都来自屏幕那一份配置。
    const lineAxis = lineOption.xAxis as { min: number; max: number; axisLabel: { formatter: (v: number) => string } };
    expect(lineAxis.min).toBe((lineScreen.xAxis as { min: number }).min);
    expect(lineAxis.max).toBe((lineScreen.xAxis as { max: number }).max);
    expect(lineAxis.axisLabel.formatter(lineAxis.min)).toBe('2026-03-02');
    expect(captionText()).toContain('折线图');
  });

  it('一键修复后导出：PNG 回到自动范围；撤销后再次导出又带回手动下界', async () => {
    setRiskStart();
    expect(yMinOf(MAIN_CHART)).toBe(95);
    const riskOption = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((riskOption.yAxis as Record<string, unknown>).min).toBe(95);

    repair();
    expect(yMinOf(MAIN_CHART)).toBeUndefined();
    const afterRepair = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((afterRepair.yAxis as Record<string, unknown>).min).toBeUndefined();

    undo();
    expect(yMinOf(MAIN_CHART)).toBe(95);
    const afterUndo = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((afterUndo.yAxis as Record<string, unknown>).min).toBe(95);
  });

  it('受展示上限隐藏的记录不会进 PNG，但说明文字会提醒', async () => {
    const many = ['g,v', ...Array.from({ length: 120 }, (_, index) => `s${index},${index + 1}`)].join('\n');
    render(<ChartLab table={tableOf(many, 'many.csv')} />);

    expect(captionText()).toContain('另有 20 条有效记录');
    const option = (await exportPng()).setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((option.xAxis as { data: unknown[] }).data).toHaveLength(100);
  });
});

describe('图表实验室 Day 9 C 组：下载、反馈与不重复触发', () => {
  it('PNG 成功后界面回显文件名与体积，不只在控制台打印', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    await exportPng();

    expect(downloads()).toHaveLength(1);
    expect(downloads()[0]?.download).toMatch(/^figureguard-chart-baseline-demo-\d{8}-\d{6}\.png$/);
    expect(feedbackText()).toContain('PNG 已导出');
    expect(screen.getByTestId('export-feedback').getAttribute('role')).toBe('status');
    expect(document.querySelectorAll('[data-testid="chart-png-export-host"]')).toHaveLength(0);
  });

  it('报告下载名带来源片段与时间戳，后缀 .md', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    fireEvent.click(reportButton());

    expect(downloads()).toHaveLength(1);
    expect(downloads()[0]?.download).toMatch(/^figureguard-report-baseline-demo-\d{8}-\d{6}\.md$/);
    expect(feedbackText()).toContain('Markdown 报告已导出');
  });

  it('报告导出后按钮仍可再次触发：报告 → PNG → 报告 三次点击都落文件', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    fireEvent.click(reportButton());
    await exportPng();
    fireEvent.click(reportButton());

    const names = downloads().map((anchor) => anchor.download);
    expect(names).toHaveLength(3);
    expect(names[0]).toMatch(/\.md$/);
    expect(names[1]).toMatch(/\.png$/);
    expect(names[2]).toMatch(/\.md$/);
    expect(feedbackText()).toContain('Markdown 报告已导出');
    expect(pngButton().disabled).toBe(false);
    expect(reportButton().disabled).toBe(false);
  });

  it('ECharts 没给出图像数据时：界面显示中文失败原因且没有下载', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    echartsMock.pngState.dataUrl = '';
    const before = echartsMock.instances.length;
    fireEvent.click(pngButton());
    await waitFor(() => expect(echartsMock.instances[before]?.dispose).toHaveBeenCalled());

    expect(downloads()).toHaveLength(0);
    expect(screen.getByTestId('export-feedback').getAttribute('role')).toBe('alert');
    expect(feedbackText()).toContain('没有返回图像数据');
  });

  it('导出进行中连点不会重复起实例，完成后恢复可点', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    const before = echartsMock.instances.length;
    fireEvent.click(pngButton());
    fireEvent.click(pngButton());
    fireEvent.click(reportButton());
    expect(pngButton().disabled).toBe(true);

    await waitFor(() => expect(echartsMock.instances.length).toBeGreaterThan(before));
    await waitFor(() => expect(pngButton().disabled).toBe(false));
    expect(echartsMock.instances.length).toBe(before + 1);
    expect(downloads()).toHaveLength(1);
  });

  it('反复导出 3 次：3 个离屏实例全部销毁，页面上的主图不受影响', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    const mainBefore = echartsMock.instances.length;

    for (let index = 0; index < 3; index += 1) await exportPng();

    const exports = echartsMock.instances.slice(mainBefore);
    expect(exports).toHaveLength(3);
    for (const instance of exports) expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(instanceOfChart(MAIN_CHART).dispose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-testid="chart-png-export-host"]')).toHaveLength(0);
  });

  it('两个导出按钮的 aria-describedby 都指向真实存在的说明文本', () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    for (const button of [pngButton(), reportButton()]) {
      const ids = (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const target = document.getElementById(id);
        expect(target, `aria-describedby 指向不存在的 id：${id}`).not.toBeNull();
        expect((target?.textContent ?? '').trim()).not.toBe('');
      }
    }
    expect(document.getElementById('export-report-hint')?.textContent).toContain('Markdown 报告');
  });

  it('导出前后原始数据与画面统计一字不差', async () => {
    const table = tableOf(PLANT_CSV, 'plant-growth.csv');
    const snapshot = JSON.stringify(table.rows);
    render(<ChartLab table={table} />);

    await exportPng();
    fireEvent.click(reportButton());

    expect(JSON.stringify(table.rows)).toBe(snapshot);
    expect(statsScope().getByText(/符合条件的有效记录 10 条/)).toBeTruthy();
  });
});

// ===== Day 9 最终整改：质量准入失败时的报告隔离 =====

/** 结构性缺列：准入未通过，但字段类型仍可推断、仍有 3 条有效数值记录（ChatGPT 复现用的那份 CSV）。 */
const MISSING_COLUMN_CSV = ['group,value', 'A,96', 'B,98', 'C,97', 'D'].join('\n');
/** 引号未闭合：行列结构仍是 sound，只靠解析错误阻止准入。 */
const UNCLOSED_QUOTE_CSV = ['group,value', 'A,96', 'B,98', 'C,"97'].join('\n');

/** 留证报告里一行都不该出现的正式结论标记（表格行标签与诊断状态码）。 */
const FORMAL_MARKERS = [
  '| 原始记录数 / 列数 |',
  '| 完全重复组数 |',
  '| 图表类型 |',
  '| X 轴字段 |',
  '| 图表标题 |',
  '| 分类聚合方式 |',
  '| 纵轴起点 |',
  '| 进入图表的 Y 数值范围 |',
  '| 1. 原始记录总数 |',
  '| 2. 满足当前 X ／ Y 条件的有效记录数 |',
  '| 检查状态 |',
  '| 风险级别 |',
  '| 本次修复操作 |',
  '状态码',
  '### 2.1 字段类型推断',
  '### 3.1 数据处理与展示口径',
];

/** 读回最近一次下载的真实 Blob 正文：Object URL 是假造的，Blob 内容不是。 */
async function lastDownloadText(): Promise<string> {
  const blob = downloadStub.blobs[downloadStub.blobs.length - 1];
  expect(blob, '没有捕获到下载的 Blob').toBeDefined();
  return await blob!.text();
}

function reportHint(): string {
  return document.getElementById('export-report-hint')?.textContent ?? '';
}

describe('图表实验室 Day 9 最终整改：准入失败时的报告隔离', () => {
  it('结构缺列：导出的 Markdown 只留证解析问题与阻止依据，不含任何正式图表结论', async () => {
    render(<ChartLab table={tableOf(MISSING_COLUMN_CSV, 'broken-structure.csv')} />);

    expect(screen.getByTestId('chart-blocked')).toBeTruthy();
    expect(pngButton().disabled).toBe(true);
    expect(reportButton().disabled).toBe(false);

    fireEvent.click(reportButton());

    expect(downloads()).toHaveLength(1);
    expect(downloads()[0]?.download).toMatch(/^figureguard-report-broken-structure-\d{8}-\d{6}\.md$/);
    // 导出流程没有抛异常：失败会走 alert 分支写「报告导出失败」。
    expect(feedbackText()).toContain('Markdown 报告已导出');
    expect(feedbackText()).not.toContain('失败');

    const markdown = await lastDownloadText();
    expect(markdown).toContain('本数据集未通过质量准入');
    expect(markdown).toContain('| 数据质量准入 | 未通过 |');
    expect(markdown).toContain('结构降级依据');
    expect(markdown).toContain('阻止正式结论的原因');
    for (const marker of FORMAL_MARKERS) {
      expect(markdown, `留证报告不应包含正式结论：${marker}\n${markdown}`).not.toContain(marker);
    }
    // 第 2 至第 6 节逐节声明未执行，且不当成「没有问题」。
    for (const heading of ['## 2.', '## 3.', '## 4.', '## 5.', '## 6.']) {
      expect(markdown, `缺少章节：${heading}`).toContain(heading);
    }
    expect(markdown).toContain('本次**未输出**数据质量统计');
    expect(markdown.match(/本节\*\*未执行\*\*/g) ?? []).toHaveLength(4);
    expect(markdown).toContain('「未执行」不等于「检查通过」');
    // 绘图数值一条都不落地：96 / 98 只存在于第 1 节之外的原始文件里。
    expect(markdown).not.toContain('96 – 98');
    expect(markdown).not.toContain('A,96');
  });

  it('引号未闭合但结构未降级：同样只出留证报告', async () => {
    render(<ChartLab table={tableOf(UNCLOSED_QUOTE_CSV, 'broken-quote.csv')} />);

    expect(screen.getByTestId('chart-blocked')).toBeTruthy();
    expect(pngButton().disabled).toBe(true);
    fireEvent.click(reportButton());

    const markdown = await lastDownloadText();
    expect(markdown).toContain('行列结构与表头一致（sound）');
    expect(markdown).toContain('引号未闭合（MissingQuotes）：1 条');
    expect(markdown).toContain('本数据集未通过质量准入');
    for (const marker of FORMAL_MARKERS) expect(markdown).not.toContain(marker);
  });

  it('正常演示数据：PNG 照常导出，报告仍是完整七章节正式报告', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    expect(pngButton().disabled).toBe(false);
    await exportPng();
    fireEvent.click(reportButton());

    expect(downloads()).toHaveLength(2);
    const markdown = await lastDownloadText();
    expect(markdown.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(7);
    expect(markdown).not.toContain('非正式结论');
    expect(markdown).not.toContain('「未执行」不等于「检查通过」');
    expect(markdown).toContain('| 图表类型 | 柱状图 |');
    expect(markdown).toContain('| 2. 满足当前 X ／ Y 条件的有效记录数 | 3 条 |');
    expect(markdown).toContain('状态码 clear');
    expect(markdown).toContain('96 – 98');
  });

  it('非零基线风险 + 修复记录：准入通过后仍写进正式报告（整改未误伤正常链路）', async () => {
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);
    setStartManual('95');
    expect(yMinOf(MAIN_CHART)).toBe(95);
    fireEvent.click(reportButton());
    const beforeRepair = await lastDownloadText();
    expect(beforeRepair).toContain('状态码 risk');
    expect(beforeRepair).toContain('手动 95');
    expect(beforeRepair).not.toContain('| 本次修复操作 |');
    expect(beforeRepair).toContain('当前没有生效的修复记录');

    repair();
    fireEvent.click(reportButton());
    const afterRepair = await lastDownloadText();
    expect(afterRepair).toContain('状态码 clear');
    expect(afterRepair).toContain('修复前真实纵轴下界');
    expect(afterRepair).toContain('一键恢复零基线');

    undo();
    fireEvent.click(reportButton());
    const afterUndo = await lastDownloadText();
    expect(afterUndo).toContain('状态码 risk');
    expect(afterUndo).toContain('当前没有生效的修复记录');
  });

  it('下载面板提示与报告口径一致：阻止态不再承诺七个部分的正式内容', () => {
    render(<ChartLab table={tableOf(MISSING_COLUMN_CSV, 'broken-structure.csv')} />);

    expect(reportHint()).toContain('当前数据未通过质量准入');
    expect(reportHint()).toContain('不提供正式数据质量统计');
    expect(reportHint()).toContain('不等于「检查通过」');
    expect(reportHint()).not.toContain('七个部分');
    expect(captionText()).toContain('屏幕上没有正式图表');
    expect(captionText()).toContain('PNG 已禁用');
    expect(captionText()).not.toContain('导出对象是当前画面上的这张');

    cleanup();
    render(<ChartLab table={tableOf(BASELINE_CSV, 'baseline-demo.csv')} />);

    expect(reportHint()).toContain('质量摘要、图表配置、参与与排除记录、风险诊断、修复记录与分析边界七个部分');
    expect(captionText()).toContain('导出对象是当前画面上的这张柱状图');
  });

  it('阻止态导出报告不改动原始数据：CSV 单元格逐值不变', async () => {
    const table = tableOf(MISSING_COLUMN_CSV, 'broken-structure.csv');
    const snapshot = JSON.stringify(table.rows);
    render(<ChartLab table={table} />);

    fireEvent.click(reportButton());
    await lastDownloadText();

    expect(JSON.stringify(table.rows)).toBe(snapshot);
  });
});
