import { useEffect, useRef } from 'react';

import { echarts } from '../lib/echartsCore';
import type { EChartsInstance } from '../lib/echartsCore';

interface EChartCanvasProps {
  /** 由 lib/chartData.ts 生成的完整 option；更换时以 notMerge 覆盖，避免旧系列残留。 */
  option: Record<string, unknown>;
  /** 图表的无障碍标题（role="img" 的 aria-label）。 */
  ariaLabel: string;
  /** 供读屏使用的等价文字说明。 */
  description: string;
  /** 明确高度，避免容器塌成 0 导致空白画布。 */
  height?: number;
}

/**
 * 可复用的 ECharts React 容器。
 *
 * - 只在挂载时初始化一次实例，卸载时 dispose；父组件通过 `key` 换文件时自然重建，不泄漏实例。
 * - option 变化时以 `setOption(option, true)` 全量覆盖。
 * - 容器尺寸变化用 ResizeObserver + window resize 触发 `resize()`。
 * - React StrictMode 下 setup→cleanup→setup 会正确地 dispose 旧实例、重建新实例并重设 option。
 */
export function EChartCanvas({ option, ariaLabel, description, height = 420 }: EChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    let chart: EChartsInstance;
    try {
      chart = echarts.init(node);
    } catch {
      // 无 Canvas 的环境（如 jsdom / SSR）无法绘制，跳过即可；真实浏览器有 Canvas 时正常初始化。
      return;
    }
    chartRef.current = chart;

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(node);
    }
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
      try {
        chart.dispose();
      } catch {
        // 同上：无 Canvas 环境的销毁路径可能抛错，忽略即可，实例引用仍会置空。
      }
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.setOption(option as echarts.EChartsCoreOption, true);
    } catch {
      // 无 Canvas 环境下 setOption 可能失败，忽略以保证其余界面正常渲染。
    }
  }, [option]);

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
        className="w-full"
        data-testid="echarts-canvas"
      />
      <p className="sr-only">{description}</p>
    </div>
  );
}
