// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PNG_BACKGROUND_COLOR,
  PNG_EXPORT_HEIGHT,
  PNG_EXPORT_WIDTH,
  PNG_PIXEL_RATIO,
  buildPngExportOption,
  exportChartPng,
  pngDataUrlToBlob,
} from './chartPngExport';
import type { SaveFileOutcome } from './fileDownload';

/** 合法 PNG 头部的 base64：解码后 8 字节，用来验证导出真的写进了二进制内容。 */
const PNG_BASE64 = 'iVBORw0KGgo=';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

// 离屏实例由这里假造：jsdom 没有 Canvas，重点验证「用的是哪一份 option、生命周期有没有收干净」。
const echartsMock = vi.hoisted(() => {
  interface FakeInstance {
    el: unknown;
    initSize: { width?: number; height?: number } | undefined;
    setOption: ReturnType<typeof vi.fn>;
    getZr: ReturnType<typeof vi.fn>;
    getDataURL: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }
  const instances: FakeInstance[] = [];
  const state = {
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    dataUrlThrows: null as Error | null,
    initThrows: null as Error | null,
    zrThrows: false,
    flushCount: 0,
  };
  const init = vi.fn((el: unknown, _theme?: unknown, opts?: { width?: number; height?: number }) => {
    if (state.initThrows !== null) throw state.initThrows;
    const instance: FakeInstance = {
      el,
      initSize: opts,
      setOption: vi.fn(),
      getZr: vi.fn(() => {
        if (state.zrThrows) throw new Error('没有 zrender 句柄');
        return { flush: () => (state.flushCount += 1) };
      }),
      getDataURL: vi.fn(() => {
        if (state.dataUrlThrows !== null) throw state.dataUrlThrows;
        return state.dataUrl;
      }),
      dispose: vi.fn(),
    };
    instances.push(instance);
    return instance;
  });
  return { init, use: vi.fn(), instances, state };
});

vi.mock('../lib/echartsCore', () => ({
  echarts: { init: echartsMock.init, use: echartsMock.use },
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalClick = HTMLAnchorElement.prototype.click;
const clickedAnchors: HTMLAnchorElement[] = [];

function liveHosts(): number {
  return document.querySelectorAll('[data-testid="chart-png-export-host"]').length;
}

/** 屏幕上真实使用的那份 option 的最小形状：数据与轴配置由调用方传入。 */
function screenOption(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    animation: true,
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    yAxis: { type: 'value', min: 95 },
    series: [{ type: 'bar', data: [96, 98, 97] }],
    ...overrides,
  };
}

beforeEach(() => {
  clickedAnchors.length = 0;
  echartsMock.instances.length = 0;
  echartsMock.init.mockClear();
  echartsMock.state.dataUrl = PNG_DATA_URL;
  echartsMock.state.dataUrlThrows = null;
  echartsMock.state.initThrows = null;
  echartsMock.state.zrThrows = false;
  echartsMock.state.flushCount = 0;
  URL.createObjectURL = vi.fn(() => 'blob:figureguard/png') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = vi.fn(function (this: HTMLAnchorElement) {
    clickedAnchors.push(this);
  }) as unknown as typeof HTMLAnchorElement.prototype.click;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  HTMLAnchorElement.prototype.click = originalClick;
  document.body.innerHTML = '';
});

describe('buildPngExportOption：只加表达配置，不碰数据与坐标轴', () => {
  it('series / 类别顺序 / yAxis.min 与屏幕 option 逐字一致', () => {
    const option = screenOption();
    const built = buildPngExportOption(option, '三个类别的平均高度');
    expect(built.series).toEqual(option.series);
    expect(built.xAxis).toEqual(option.xAxis);
    expect(built.yAxis).toEqual(option.yAxis);
  });

  it('关掉动画并铺白底：否则 getDataURL 抓到的是首帧空图', () => {
    const built = buildPngExportOption(screenOption(), '标题');
    expect(built.animation).toBe(false);
    expect(built.backgroundColor).toBe(PNG_BACKGROUND_COLOR);
  });

  it('把标题画进画布：页面里的 HTML 标题不会进 getDataURL', () => {
    const built = buildPngExportOption(screenOption(), '不同处理组的高度平均值');
    const title = built.title as Record<string, unknown>;
    expect(title.text).toBe('不同处理组的高度平均值');
    expect(title.left).toBe('center');
    expect(typeof (title.textStyle as Record<string, unknown>).fontSize).toBe('number');
  });

  it('抬高绘图区，标题越长让出的空间越多', () => {
    const short = buildPngExportOption(screenOption(), '短');
    const long = buildPngExportOption(screenOption(), '这是一个非常长的图表标题'.repeat(6));
    const topOf = (built: Record<string, unknown>) => (built.grid as Record<string, number>).top;
    expect(topOf(short)).toBeGreaterThan(24);
    expect(topOf(long)).toBeGreaterThan(topOf(short));
  });

  it('保留原 grid 的其它键；grid 缺失或为数组时退回默认顶部留白', () => {
    const kept = buildPngExportOption(screenOption({ grid: { left: 60, top: 30, right: 20 } }), '标题');
    const grid = kept.grid as Record<string, number>;
    expect(grid.left).toBe(60);
    expect(grid.right).toBe(20);
    expect(grid.top).toBeGreaterThan(30);
    const none = buildPngExportOption(screenOption({ grid: undefined }), '标题');
    expect((none.grid as Record<string, number>).top).toBeGreaterThan(0);
    const arrayGrid = buildPngExportOption(screenOption({ grid: [{ left: 10 }] }), '标题');
    expect((arrayGrid.grid as Record<string, number>).left).toBeUndefined();
  });

  it('不修改传入的 option 对象', () => {
    const option = screenOption();
    const before = JSON.stringify(option);
    buildPngExportOption(option, '标题');
    expect(JSON.stringify(option)).toBe(before);
  });
});

describe('pngDataUrlToBlob：只接受真正的 PNG 数据', () => {
  it('解码 base64 成 image/png Blob', async () => {
    const blob = pngDataUrlToBlob(PNG_DATA_URL);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(8);
  });

  it('非 PNG 形态、空载荷与非法 base64 都返回 null', () => {
    expect(pngDataUrlToBlob('data:image/jpeg;base64,/9j/4AAQ')).toBeNull();
    expect(pngDataUrlToBlob('data:image/png;base64,')).toBeNull();
    expect(pngDataUrlToBlob('')).toBeNull();
    expect(pngDataUrlToBlob('data:image/png;base64,%%%')).toBeNull();
  });
});

describe('exportChartPng：离屏实例生命周期', () => {
  /** 第 index 个离屏实例真正收到的那份 option；没有 setOption 就直接失败，不用可选链吞掉。 */
  function optionPassed(index: number): Record<string, unknown> {
    const call = echartsMock.instances[index]?.setOption.mock.calls[0];
    if (!call) throw new Error(`第 ${index + 1} 个离屏实例没有收到 setOption`);
    return call[0] as Record<string, unknown>;
  }

  it('柱状图导出成功：走真实 option、白色背景、2 倍像素比并触发下载', async () => {
    const outcome = await exportChartPng({
      option: screenOption(),
      title: '三个类别的平均高度',
      fileName: 'figureguard-chart-demo.png',
    });
    expect(outcome.ok).toBe(true);
    expect(echartsMock.instances).toHaveLength(1);
    const instance = echartsMock.instances[0]!;
    const passed = instance.setOption.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((passed.series as Array<Record<string, unknown>>)[0].data).toEqual([96, 98, 97]);
    expect((passed.yAxis as Record<string, unknown>).min).toBe(95);
    expect(passed.animation).toBe(false);
    expect(instance.setOption.mock.calls[0]?.[1]).toBe(true);
    expect(instance.getDataURL).toHaveBeenCalledWith({
      type: 'png',
      pixelRatio: PNG_PIXEL_RATIO,
      backgroundColor: PNG_BACKGROUND_COLOR,
    });
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0]!.download).toBe('figureguard-chart-demo.png');
    expect(outcome).toMatchObject({ fileName: 'figureguard-chart-demo.png', byteLength: 8 });
  });

  it('散点图与折线图的 option 同样原样透传（数值轴 + 时间轴）', async () => {
    const scatter = screenOption({
      xAxis: { type: 'value' },
      series: [{ type: 'scatter', data: [[1, 2], [3, 4]] }],
    });
    await exportChartPng({ option: scatter, title: '散点', fileName: 's.png' });
    const line = screenOption({
      xAxis: { type: 'time' },
      series: [{ type: 'line', data: [[Date.UTC(2026, 2, 2), 12.4]] }],
    });
    await exportChartPng({ option: line, title: '折线', fileName: 'l.png' });
    expect(optionPassed(0).series).toEqual(scatter.series);
    expect(optionPassed(1).series).toEqual(line.series);
    expect(optionPassed(1).xAxis).toEqual(line.xAxis);
  });

  it('离屏容器有真实宽高、不在可视区且不是 display:none', async () => {
    await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    const el = echartsMock.instances[0]!.el as HTMLElement;
    expect(echartsMock.instances[0]!.initSize).toEqual({ width: PNG_EXPORT_WIDTH, height: PNG_EXPORT_HEIGHT });
    expect(el.style.display).not.toBe('none');
    expect(el.style.width).toBe(`${PNG_EXPORT_WIDTH}px`);
    expect(el.style.height).toBe(`${PNG_EXPORT_HEIGHT}px`);
    expect(el.style.position).toBe('fixed');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('取图前先 flush 再等两帧，避免抓到动画中间帧', async () => {
    await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(echartsMock.state.flushCount).toBe(1);
    const instance = echartsMock.instances[0]!;
    expect(instance.getZr.mock.invocationCallOrder[0]).toBeLessThan(instance.getDataURL.mock.invocationCallOrder[0]);
  });

  it('zrender 句柄不可用时不阻断导出', async () => {
    echartsMock.state.zrThrows = true;
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(outcome.ok).toBe(true);
    expect(echartsMock.instances[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it('成功与失败都销毁实例并移除临时 DOM，反复导出不堆积', async () => {
    const results: SaveFileOutcome[] = [];
    for (let index = 0; index < 3; index += 1) {
      results.push(await exportChartPng({ option: screenOption(), title: `标题 ${index}`, fileName: `c${index}.png` }));
    }
    echartsMock.state.dataUrl = '';
    results.push(await exportChartPng({ option: screenOption(), title: '坏图', fileName: 'bad.png' }));
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(echartsMock.instances).toHaveLength(4);
    for (const instance of echartsMock.instances) expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(liveHosts()).toBe(0);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('ECharts 没返回图像数据时给出中文失败说明', async () => {
    echartsMock.state.dataUrl = '';
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('没有返回图像数据');
    expect(clickedAnchors).toHaveLength(0);
  });

  it('返回的不是有效 PNG 时不落盘', async () => {
    echartsMock.state.dataUrl = 'data:image/svg+xml;base64,PHN2Zy8+';
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('不是有效的 PNG');
  });

  it('getDataURL 抛错被兜住，临时资源照样清理', async () => {
    echartsMock.state.dataUrlThrows = new Error('画布已被回收');
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('画布已被回收');
    expect(echartsMock.instances[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(liveHosts()).toBe(0);
  });

  it('init 抛错时也不留下临时 DOM', async () => {
    echartsMock.state.initThrows = new Error('无法初始化');
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('无法初始化');
    expect(liveHosts()).toBe(0);
    expect(clickedAnchors).toHaveLength(0);
  });

  it('尺寸或像素比非法时先拒绝，不创建实例', async () => {
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png', width: 0 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('导出尺寸或像素比无效');
    expect(echartsMock.init).not.toHaveBeenCalled();
    expect(liveHosts()).toBe(0);
    const ratioOutcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png', pixelRatio: Number.NaN });
    expect(ratioOutcome.ok).toBe(false);
  });

  it('没有 document 时安全失败', async () => {
    vi.stubGlobal('document', undefined);
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('无法生成 PNG 图表');
    expect(echartsMock.init).not.toHaveBeenCalled();
  });

  it('自定义像素比与尺寸会同时传给 ECharts 和离屏实例', async () => {
    await exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png', width: 640, height: 360, pixelRatio: 3 });
    expect(echartsMock.instances[0]!.initSize).toEqual({ width: 640, height: 360 });
    expect(instanceDataUrlRatio(echartsMock.instances[0]!)).toBe(3);
  });

  it('页面在后台、requestAnimationFrame 不触发时：超时兜底仍完成导出，按钮不会永远卡住', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.useFakeTimers();
    const pending = exportChartPng({ option: screenOption(), title: '标题', fileName: 'bg.png' });
    await vi.runAllTimersAsync();
    const outcome = await pending;

    expect(outcome.ok).toBe(true);
    expect(clickedAnchors).toHaveLength(1);
    expect(echartsMock.instances[0]!.dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    raf.mockRestore();
  });

  it('页面在后台（rAF 与定时器都被限流）：跳过等帧立刻取图，导出不会挂起', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    vi.useFakeTimers();

    // 不推进任何定时器：后台路径应当在纯微任务里就走完。
    const outcome = await exportChartPng({ option: screenOption(), title: '标题', fileName: 'hidden.png' });

    vi.useRealTimers();
    visibility.mockRestore();
    raf.mockRestore();
    expect(outcome.ok).toBe(true);
    expect(echartsMock.instances[0]!.getDataURL).toHaveBeenCalledTimes(1);
    expect(echartsMock.instances[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(clickedAnchors).toHaveLength(1);
    expect(liveHosts()).toBe(0);
  });

  it('下载的 Object URL 等帧与回收定时器都走完后才释放', async () => {
    vi.useFakeTimers();
    const pending = exportChartPng({ option: screenOption(), title: '标题', fileName: 'a.png' });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:figureguard/png');
  });
});

function instanceDataUrlRatio(instance: { getDataURL: ReturnType<typeof vi.fn> }): number {
  const call = instance.getDataURL.mock.calls[0]?.[0] as { pixelRatio: number };
  return call.pixelRatio;
}
