// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartLab } from './ChartLab';
import { parseCsvText } from '../lib/csv';
import type { CsvTable } from '../types/csv';

// 用假的 ECharts 替换真实模块：jsdom 没有 Canvas，重点验证容器生命周期与界面行为。
const echartsMock = vi.hoisted(() => {
  const instances: Array<{
    setOption: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const init = vi.fn(() => {
    const instance = { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    instances.push(instance);
    return instance;
  });
  const use = vi.fn();
  return { init, use, instances };
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

beforeEach(() => {
  echartsMock.init.mockClear();
  echartsMock.instances.length = 0;
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
