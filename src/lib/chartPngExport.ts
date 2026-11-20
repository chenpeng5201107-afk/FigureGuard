import { echarts } from './echartsCore';
import { saveFile } from './fileDownload';
import type { SaveFileOutcome } from './fileDownload';

/**
 * 当前主图的 PNG 导出（Day 9）。
 *
 * 做法：把页面上**正在使用的那一份 ECharts option** 原样交给一个临时离屏实例，只额外叠加
 * 「画布内标题 + 白底 + 关闭动画」三项导出专用配置，再用官方 `getDataURL()` 取图。
 * 因此数据点、类别顺序、坐标轴范围与纵轴下界与屏幕完全一致：本模块不重新算任何数值，
 * 也不引入截图库，更不会因为导出而修改 `CsvTable` 或图表配置。
 */

/** 导出画布的 CSS 像素尺寸：与页面主图同量级，2 倍像素比后约 1920×1080，够插报告与幻灯片。 */
export const PNG_EXPORT_WIDTH = 960;
export const PNG_EXPORT_HEIGHT = 540;
/** 像素比：`getDataURL` 按它放大实际位图分辨率，文字与刻度才不至于插入文档后发虚。 */
export const PNG_PIXEL_RATIO = 2;
/** 白色背景：透明 PNG 插进深色或带底色的实验报告里会看不清坐标轴。 */
export const PNG_BACKGROUND_COLOR = '#ffffff';
/** 标题字号与左右留白：用于按标题长度估算需要让出多少顶部空间。 */
const TITLE_FONT_SIZE = 17;
const TITLE_WIDTH_RATIO = 0.86;
const TITLE_LINE_HEIGHT = 24;
const TITLE_TOP_GAP = 10;
const TITLE_BOTTOM_GAP = 14;
const MIN_TITLE_BAND_PX = 46;
const DEFAULT_GRID_TOP_PX = 24;

export interface PngExportRequest {
  /** 当前真实生效的绘图 option（`toEChartsOption()` 的输出），数据与坐标轴配置逐字沿用。 */
  option: Record<string, unknown>;
  /** 生效的图表标题：页面里的 HTML 标题不会进 `getDataURL()`，必须显式画进画布。 */
  title: string;
  /** 已拼好的安全下载文件名。 */
  fileName: string;
  width?: number;
  height?: number;
  pixelRatio?: number;
}

function codePointLength(text: string): number {
  return [...text].length;
}

/** 按画布宽度与字号估算标题占几行，据此给绘图区让出顶部空间，避免标题压住图形或长标题被裁。 */
function titleBandPx(title: string, width: number): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : PNG_EXPORT_WIDTH;
  const charsPerLine = Math.max(12, Math.floor((safeWidth * TITLE_WIDTH_RATIO) / TITLE_FONT_SIZE));
  const lines = Math.max(1, Math.ceil(codePointLength(title) / charsPerLine));
  return Math.max(MIN_TITLE_BAND_PX, TITLE_TOP_GAP + lines * TITLE_LINE_HEIGHT + TITLE_BOTTOM_GAP);
}

/**
 * 生成导出专用 option。
 *
 * 只动三处：`animation` 关掉（否则 `getDataURL()` 会抓到动画首帧、柱子高度为 0）、
 * 背景改成白色、加一个画布内 `title` 并抬高 `grid.top`。
 * `series` / `xAxis.data` / `yAxis.min` 等绘图与坐标轴配置原样透传，不做任何二次计算。
 */
export function buildPngExportOption(
  option: Record<string, unknown>,
  title: string,
  width = PNG_EXPORT_WIDTH,
): Record<string, unknown> {
  const rawGrid = option.grid;
  const grid =
    typeof rawGrid === 'object' && rawGrid !== null && !Array.isArray(rawGrid)
      ? (rawGrid as Record<string, unknown>)
      : {};
  const baseTop = typeof grid.top === 'number' && Number.isFinite(grid.top) ? grid.top : DEFAULT_GRID_TOP_PX;

  return {
    ...option,
    animation: false,
    backgroundColor: PNG_BACKGROUND_COLOR,
    title: {
      text: title,
      left: 'center',
      top: TITLE_TOP_GAP,
      width: `${Math.round(TITLE_WIDTH_RATIO * 100)}%`,
      overflow: 'break',
      textStyle: { color: '#0f172a', fontSize: TITLE_FONT_SIZE, fontWeight: 600 },
    },
    grid: { ...grid, top: baseTop + titleBandPx(title, width) },
  };
}

/**
 * 等两帧：第一帧让 ECharts 完成布局与绘制，第二帧确保 zrender 已把内容刷进 canvas。
 * 页面在后台时 `requestAnimationFrame` 不触发、定时器也会被限流，而 `animation:false` +
 * `getZr().flush()` 已经同步把内容画进 canvas，所以此时直接取图，不让导出挂在后台里。
 * 前台路径每帧仍带超时兜底，任何环境下都不会无限等待。
 */
const FRAME_FALLBACK_MS = 60;

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FRAME_FALLBACK_MS);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** 等待渲染落进 canvas；后台页面跳过等帧。 */
async function waitForPaint(): Promise<void> {
  if (pageHidden()) return;
  await nextFrame();
  if (pageHidden()) return;
  await nextFrame();
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** 把 `data:image/png;base64,...` 解码成 Blob；形态不对或 base64 非法时返回 null。 */
export function pngDataUrlToBlob(dataUrl: string): Blob | null {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) return null;
  const encoded = dataUrl.slice(prefix.length);
  if (encoded === '') return null;
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * 导出当前图表为 PNG 并触发本地下载。
 *
 * 生命周期由本函数独自负责：临时容器**有真实宽高**（`position:fixed` 移出可视区，不能用 `display:none`，
 * 否则 ECharts 拿不到尺寸、画布塌成 0），成功与失败都会 `dispose()` 实例并摘掉临时 DOM 节点。
 */
export async function exportChartPng(request: PngExportRequest): Promise<SaveFileOutcome> {
  const doc = typeof document === 'undefined' ? null : document;
  if (doc === null) {
    return { ok: false, fileName: request.fileName, message: '当前浏览器环境不可用，无法生成 PNG 图表。' };
  }

  const width = request.width ?? PNG_EXPORT_WIDTH;
  const height = request.height ?? PNG_EXPORT_HEIGHT;
  const pixelRatio = request.pixelRatio ?? PNG_PIXEL_RATIO;
  if (
    !Number.isFinite(width) || width <= 0 ||
    !Number.isFinite(height) || height <= 0 ||
    !Number.isFinite(pixelRatio) || pixelRatio <= 0
  ) {
    return { ok: false, fileName: request.fileName, message: '导出尺寸或像素比无效，已停止生成 PNG。' };
  }

  const host = doc.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('data-testid', 'chart-png-export-host');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = 'none';
  doc.body.appendChild(host);

  let chart: ReturnType<typeof echarts.init> | null = null;
  try {
    chart = echarts.init(host, undefined, { width, height });
    chart.setOption(buildPngExportOption(request.option, request.title, width) as echarts.EChartsCoreOption, true);
    try {
      chart.getZr().flush();
    } catch {
      // 没有 zrender 句柄（模拟环境）时仍继续：后面的等帧兜底渲染。
    }
    await waitForPaint();

    const dataUrl = chart.getDataURL({ type: 'png', pixelRatio, backgroundColor: PNG_BACKGROUND_COLOR });
    if (typeof dataUrl !== 'string' || dataUrl === '') {
      return { ok: false, fileName: request.fileName, message: 'ECharts 没有返回图像数据，本次没有生成 PNG 文件。' };
    }
    const blob = pngDataUrlToBlob(dataUrl);
    if (blob === null) {
      return { ok: false, fileName: request.fileName, message: 'ECharts 返回的不是有效的 PNG 图像数据，本次没有生成 PNG 文件。' };
    }
    return saveFile([blob], 'image/png', request.fileName);
  } catch (cause) {
    return { ok: false, fileName: request.fileName, message: `PNG 图表导出失败：${errorText(cause)}` };
  } finally {
    if (chart !== null) {
      try {
        chart.dispose();
      } catch {
        // 无 Canvas 环境的销毁路径可能抛错：实例引用随函数返回一起消失，不影响界面。
      }
    }
    try {
      host.remove();
    } catch {
      // 节点已不在文档里：没有需要清理的临时 DOM。
    }
  }
}
